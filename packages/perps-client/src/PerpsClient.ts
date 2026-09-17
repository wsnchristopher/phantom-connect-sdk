/**
 * PerpsClient — Hyperliquid perpetuals trading via Phantom backend.
 *
 * Intentionally decoupled from PhantomClient: takes a plain EVM address and
 * a signTypedData callback so it can be used in any context (MCP server,
 * tests with a mock signer, other wallet backends, etc.).
 */

import type {
  PerpAccountBalance,
  PerpPosition,
  PerpOrder,
  PerpMarket,
  HistoricalOrder,
  FundingActivity,
  OpenPositionParams,
  ClosePositionParams,
  CancelOrderParams,
  UpdateLeverageParams,
  ActionResponse,
  HlOrderAction,
  HlCancelAction,
  HlUpdateLeverageAction,
  Eip712TypedData,
  WithdrawFromSpotParams,
  WithdrawFromSpotResult,
  RelayWithdrawalV2Quote,
} from "./schemas";
import { noopLogger } from "./logger";
import type { PerpsLogger } from "./logger";
import { PerpsApi } from "./api";
import type { ApiClient } from "./api";
import {
  buildExchangeActionTypedData,
  buildUsdClassTransferTypedData,
  nextNonce,
  splitSignature,
  formatPrice,
  formatSize,
  resolveLimitPrice,
} from "./actions";
import {
  HYPERCORE_MAINNET_CHAIN_ID,
  MARKET_ORDER_SLIPPAGE,
  HYPERLIQUID_SIGN_TRANSACTION_DOMAIN,
  EIP712_DOMAIN_TYPE,
  USDC_ADDRESSES,
} from "./constants";
import { assertPositiveDecimalString } from "./validate";
import { parseSignMessageResponse } from "@phantom/parsers";

export interface PerpsClientOptions {
  /** The wallet's EVM address (0x-prefixed, checksummed or lowercase) */
  evmAddress: string;
  /**
   * Signs EIP-712 typed data and returns the raw hex signature (0x-prefixed, 65 bytes).
   * In the MCP server this is bound to PhantomClient.ethereumSignTypedData().
   */
  signTypedData: (typedData: Eip712TypedData) => Promise<string>;
  /** Optional logger — if provided, all API calls and errors are logged */
  logger?: PerpsLogger;
  /** Shared API client that routes all requests through the proxy */
  apiClient: ApiClient;
}

export class PerpsClient {
  private readonly evmAddress: string;
  private readonly signTypedData: (typedData: Eip712TypedData) => Promise<string>;
  private readonly api: PerpsApi;
  private readonly logger: PerpsLogger;

  constructor(opts: PerpsClientOptions) {
    this.evmAddress = opts.evmAddress.toLowerCase();
    this.signTypedData = opts.signTypedData;
    this.logger = opts.logger ?? noopLogger;
    this.logger.debug(`PerpsClient initialized evmAddress=${this.evmAddress} taker=${this.getUserCaip19()}`);
    this.api = new PerpsApi({
      logger: this.logger,
      apiClient: opts.apiClient,
    });
  }

  // ── Read (no signing) ────────────────────────────────────────────────────

  async getBalance(): Promise<PerpAccountBalance> {
    return this.api.getAccountBalance(this.getUserCaip19());
  }

  async getPositions(): Promise<PerpPosition[]> {
    const { positions } = await this.api.getPositionsAndOpenOrders(this.getUserCaip19());
    return positions;
  }

  async getOpenOrders(): Promise<PerpOrder[]> {
    const { openOrders } = await this.api.getPositionsAndOpenOrders(this.getUserCaip19());
    return openOrders;
  }

  /** Returns all available perp markets. Used by the get_perp_markets MCP tool. */
  async getMarkets(): Promise<PerpMarket[]> {
    return this.api.getAllMarkets();
  }

  async getTradeHistory(): Promise<HistoricalOrder[]> {
    return this.api.getTradeHistory(this.getUserCaip19());
  }

  async getFundingHistory(): Promise<FundingActivity[]> {
    return this.api.getFundingHistory(this.getUserCaip19());
  }

  // ── Write (EIP-712 sign → submit) ────────────────────────────────────────

  async openPosition(params: OpenPositionParams): Promise<ActionResponse> {
    this.logger.info(
      `openPosition market=${params.market} direction=${params.direction} sizeUsd=${params.sizeUsd} leverage=${params.leverage} orderType=${params.orderType} taker=${this.evmAddress}`,
    );
    assertPositiveDecimalString(params.sizeUsd, "sizeUsd");
    const market = await this.findMarket(params.market);
    if (!market) {
      throw new Error(`Market not found: ${params.market}`);
    }
    const assetId = this.requireAssetId(market);

    // Set leverage before placing the order (required by Hyperliquid).
    // Defaults to isolated margin — cross margin shares account balance across positions.
    const leverageAction: HlUpdateLeverageAction = {
      type: "updateLeverage",
      asset: assetId,
      isCross: params.marginType === "cross",
      leverage: params.leverage,
    };
    const leverageNonce = nextNonce();
    const leverageTypedData = buildExchangeActionTypedData(leverageAction, leverageNonce);
    const leverageSig = await this.sign(leverageTypedData);
    await this.api.postUpdateLeverage({
      action: leverageAction,
      nonce: leverageNonce,
      signature: leverageSig,
    });

    const isBuy = params.direction === "long";
    const price = parseFloat(market.price);
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`Invalid market price for ${params.market}: ${market.price}`);
    }
    const rawSize = parseFloat(params.sizeUsd) / price;
    if (!Number.isFinite(rawSize) || rawSize <= 0) {
      throw new Error(`Computed order size is invalid (sizeUsd=${params.sizeUsd}, price=${market.price})`);
    }

    const limitPx = resolveLimitPrice(params.orderType, params.limitPrice, price, isBuy, market.szDecimals);

    // Round down so the required margin never exceeds the available balance.
    // Rounding up (ceil) can cause "insufficient margin" rejections from Hyperliquid.
    const factor = Math.pow(10, market.szDecimals);
    const sz = (Math.floor(rawSize * factor) / factor).toFixed(market.szDecimals);
    if (parseFloat(sz) <= 0) {
      throw new Error(`Order size rounds to zero (sizeUsd=${params.sizeUsd}, price=${market.price})`);
    }

    const action: HlOrderAction = {
      type: "order",
      orders: [
        {
          a: assetId,
          b: isBuy,
          p: limitPx,
          s: sz,
          r: params.reduceOnly ?? false,
          t: params.orderType === "limit" ? { limit: { tif: "Gtc" } } : { limit: { tif: "Ioc" } },
        },
      ],
      grouping: "na",
    };

    const nonce = nextNonce();
    this.logger.debug(`openPosition placing order market=${params.market} sz=${sz} limitPx=${limitPx} nonce=${nonce}`);
    const typedData = buildExchangeActionTypedData(action, nonce);
    const sig = await this.sign(typedData);
    const result = await this.api.postPlaceOrder({ action, nonce, signature: sig });
    this.logger.info(`openPosition result status=${result.status}`);
    return { status: result.status, data: result };
  }

  async closePosition(params: ClosePositionParams): Promise<ActionResponse> {
    this.logger.info(
      `closePosition market=${params.market} sizePercent=${params.sizePercent ?? 100} taker=${this.evmAddress}`,
    );
    const [market, positions] = await Promise.all([this.findMarket(params.market), this.getPositions()]);

    if (!market) {
      throw new Error(`Market not found: ${params.market}`);
    }

    const assetId = this.requireAssetId(market);
    const position = positions.find(p => p.coin.trim() === market.symbol.trim());
    if (!position) {
      throw new Error(`No open position for market: ${params.market}`);
    }

    const sizePercent = (params.sizePercent ?? 100) / 100;
    const positionSize = Math.abs(parseFloat(position.size));
    if (!Number.isFinite(positionSize) || positionSize <= 0) {
      throw new Error(`Invalid position size for ${params.market}: ${position.size}`);
    }
    const sizeToClose = positionSize * sizePercent;
    const sz = formatSize(sizeToClose, market.szDecimals);
    if (parseFloat(sz) <= 0) {
      throw new Error(`Close size rounds to zero (size=${position.size}, sizePercent=${params.sizePercent ?? 100})`);
    }

    const isBuy = position.direction === "short"; // close long = sell, close short = buy
    const price = parseFloat(market.price);
    const limitPx = formatPrice(
      price * (isBuy ? 1 + MARKET_ORDER_SLIPPAGE : 1 - MARKET_ORDER_SLIPPAGE),
      market.szDecimals,
    );

    const action: HlOrderAction = {
      type: "order",
      orders: [{ a: assetId, b: isBuy, p: limitPx, s: sz, r: true, t: { limit: { tif: "Ioc" } } }],
      grouping: "na",
    };

    const nonce = nextNonce();
    this.logger.debug(
      `closePosition placing order market=${params.market} direction=${position.direction} sz=${sz} limitPx=${limitPx} nonce=${nonce}`,
    );
    const typedData = buildExchangeActionTypedData(action, nonce);
    const sig = await this.sign(typedData);
    const result = await this.api.postPlaceOrder({ action, nonce, signature: sig });
    this.logger.info(`closePosition result status=${result.status}`);
    return { status: result.status, data: result };
  }

  async cancelOrder(params: CancelOrderParams): Promise<ActionResponse> {
    this.logger.info(`cancelOrder market=${params.market} orderId=${params.orderId} taker=${this.evmAddress}`);
    const market = await this.findMarket(params.market);
    if (!market) {
      throw new Error(`Market not found: ${params.market}`);
    }
    const assetId = this.requireAssetId(market);

    const action: HlCancelAction = {
      type: "cancel",
      cancels: [{ a: assetId, o: params.orderId }],
    };

    const nonce = nextNonce();
    const typedData = buildExchangeActionTypedData(action, nonce);
    const sig = await this.sign(typedData);
    const result = await this.api.postCancelOrder({ action, nonce, signature: sig });
    this.logger.info(`cancelOrder result status=${result.status}`);
    return { status: "ok", data: result };
  }

  async updateLeverage(params: UpdateLeverageParams): Promise<ActionResponse> {
    this.logger.info(
      `updateLeverage market=${params.market} leverage=${params.leverage} marginType=${params.marginType} taker=${this.evmAddress}`,
    );
    const market = await this.findMarket(params.market);
    if (!market) {
      throw new Error(`Market not found: ${params.market}`);
    }
    const assetId = this.requireAssetId(market);

    const action: HlUpdateLeverageAction = {
      type: "updateLeverage",
      asset: assetId,
      isCross: params.marginType === "cross",
      leverage: params.leverage,
    };

    const nonce = nextNonce();
    const typedData = buildExchangeActionTypedData(action, nonce);
    const sig = await this.sign(typedData);
    const result = await this.api.postUpdateLeverage({ action, nonce, signature: sig });
    return { status: "ok", data: result };
  }

  /**
   * Moves USDC from the Hyperliquid spot account to the perps account.
   * Both accounts are on Hypercore — this is NOT a cross-chain bridge.
   */
  async deposit(amountUsdc: string): Promise<ActionResponse> {
    this.logger.info(`deposit amountUsdc=${amountUsdc} taker=${this.evmAddress}`);
    assertPositiveDecimalString(amountUsdc, "amountUsdc");
    const nonce = nextNonce();
    const action = {
      type: "usdClassTransfer" as const,
      hyperliquidChain: "Mainnet" as const,
      signatureChainId: "0xa4b1" as const,
      amount: amountUsdc,
      toPerp: true,
      nonce,
    };

    const typedData = buildUsdClassTransferTypedData(action);
    const sig = await this.sign(typedData);
    const result = await this.api.postTransferUsdcSpotPerp({ action, nonce, signature: sig });
    return { status: "ok", data: result };
  }

  /**
   * Moves USDC from the perps account back to the Hyperliquid spot account.
   */
  async withdraw(amountUsdc: string): Promise<ActionResponse> {
    this.logger.info(`withdraw amountUsdc=${amountUsdc} taker=${this.evmAddress}`);
    assertPositiveDecimalString(amountUsdc, "amountUsdc");
    const nonce = nextNonce();
    const action = {
      type: "usdClassTransfer" as const,
      hyperliquidChain: "Mainnet" as const,
      signatureChainId: "0xa4b1" as const,
      amount: amountUsdc,
      toPerp: false,
      nonce,
    };

    const typedData = buildUsdClassTransferTypedData(action);
    const sig = await this.sign(typedData);
    const result = await this.api.postTransferUsdcSpotPerp({ action, nonce, signature: sig });
    return { status: "ok", data: result };
  }

  /**
   * Returns the Relay V2 bridge quote for withdrawing USDC from the Hyperliquid spot
   * wallet to an external chain. Use this to preview amounts before executing.
   */
  async getWithdrawFromSpotQuote(params: WithdrawFromSpotParams): Promise<RelayWithdrawalV2Quote> {
    assertPositiveDecimalString(params.amountUsdc, "amountUsdc");
    const sellAmount = Math.round(parseFloat(params.amountUsdc) * 1e8).toString();
    const buyToken = params.buyToken ?? this.resolveUsdcBuyToken(params.destinationChainId);
    const takerDestination = `${params.destinationChainId}/address:${params.destinationAddress}`;
    return this.api.getBridgeInitialize({
      buyToken,
      takerDestination,
      sellAmount,
      sourceWallet: this.getUserCaip19(),
    });
  }

  /**
   * Bridges USDC from the Hyperliquid spot wallet to an external chain via the Relay V2 bridge.
   *
   * Two-step signing flow:
   *   1. Signs an EIP-712 "authorize" message (Relay nonce mapping) and posts it to the backend.
   *   2. Signs the Hyperliquid "sendAsset" EIP-712 action (sends USDC to Relay's bridge address)
   *      and submits it to Hyperliquid via the backend's spot/send endpoint.
   */
  async withdrawFromSpot(params: WithdrawFromSpotParams): Promise<WithdrawFromSpotResult> {
    this.logger.info(`withdrawFromSpot amountUsdc=${params.amountUsdc} dest=${params.destinationChainId}`);

    const quote = await this.getWithdrawFromSpotQuote(params);
    const { authorizeStep, depositStep } = quote;

    // Step 1: sign the EIP-712 authorize message and post to Relay via backend
    this.logger.info("withdrawFromSpot: signing authorizeStep");
    const authSignatureRaw = await this.signTypedData({
      domain: authorizeStep.domain,
      types: authorizeStep.types,
      primaryType: authorizeStep.primaryType,
      message: authorizeStep.message,
    });
    // KMS returns base64url; parseSignMessageResponse converts it to 0x-prefixed hex
    const { signature: authSignatureHex } = parseSignMessageResponse(authSignatureRaw, "eip155:1" as any);
    await this.api.postAuthorize("/swap/v2/spot/authorize", {
      ...authorizeStep.postBody,
      signature: authSignatureHex,
    });

    // Step 2: sign the sendAsset EIP-712 action and submit to Hyperliquid via backend
    this.logger.info("withdrawFromSpot: signing depositStep (sendAsset)");
    const actionData = depositStep.action as { type: string; parameters: Record<string, unknown> };
    // signatureChainId is Ethereum mainnet (1) for Relay withdrawals
    const signatureChainId = 1;
    const messageToSign = {
      ...actionData.parameters,
      type: actionData.type,
      signatureChainId: `0x${signatureChainId.toString(16)}`,
    };

    const depositSig = await this.sign({
      domain: { ...HYPERLIQUID_SIGN_TRANSACTION_DOMAIN, chainId: signatureChainId },
      primaryType: depositStep.eip712PrimaryType,
      types: { EIP712Domain: EIP712_DOMAIN_TYPE, ...depositStep.eip712Types },
      message: messageToSign,
    });

    const sendResult = await this.api.postSpotSend({
      action: messageToSign,
      nonce: depositStep.nonce,
      signature: depositSig,
    });

    this.logger.info(`withdrawFromSpot complete requestId=${quote.requestId}`);
    return {
      requestId: quote.requestId,
      details: quote.details,
      checkEndpoint: depositStep.checkEndpoint,
      execution: sendResult,
    };
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private async findMarket(symbol: string): Promise<PerpMarket> {
    const caip19 = `${HYPERCORE_MAINNET_CHAIN_ID}/address:${symbol}`;
    const markets = await this.api.getMarkets([caip19]);
    const market = markets.find(m => m.symbol === symbol);
    if (!market) throw new Error(`Market not found: ${symbol}`);
    return market;
  }

  private getUserCaip19(): string {
    return `${HYPERCORE_MAINNET_CHAIN_ID}/address:${this.evmAddress}`;
  }

  private resolveUsdcBuyToken(destinationChainId: string): string {
    const usdcAddress = USDC_ADDRESSES[destinationChainId];
    if (!usdcAddress) {
      throw new Error(
        `No default USDC address for chain ${destinationChainId}. ` +
          `Pass buyToken explicitly. Known chains: ${Object.keys(USDC_ADDRESSES).join(", ")}`,
      );
    }
    return `${destinationChainId}/address:${usdcAddress}`;
  }

  /** Throws if assetId is missing — the backend DTO does not formally expose it. */
  private requireAssetId(market: PerpMarket): number {
    if (market.assetId === undefined) {
      throw new Error(`assetId not returned by backend for market ${market.symbol} — cannot construct order`);
    }
    return market.assetId;
  }

  private async sign(typedData: Eip712TypedData): Promise<ReturnType<typeof splitSignature>> {
    const signature = await this.signTypedData(typedData);
    return splitSignature(signature);
  }
}
