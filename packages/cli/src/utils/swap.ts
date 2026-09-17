/**
 * Shared swap utilities extracted from buy-token tool.
 * Provides quote fetching and swap execution for reuse across tools.
 */

import type { NetworkId, PhantomClient } from "@phantom/client";
import { isSolanaChain } from "@phantom/utils";
import { base64urlEncode } from "@phantom/base64url";
import { parseToKmsTransaction } from "@phantom/parsers";
import bs58 from "bs58";
import type {
  SolanaQuote,
  EvmSameChainQuote,
  CrossChainQuote,
  SolanaOriginCrossChainStep,
  EvmOriginCrossChainStep,
  PhantomQuotesResponse,
} from "./quotes";
import { PublicKey } from "@solana/web3.js";
import { normalizeNetworkId } from "./network";
import { fetchNonce, fetchGasPrice, estimateGas } from "./evm";
import { sendApprovalIfNeeded } from "./allowance";
import { getExplorerTxUrl } from "./explorers";
import { resolveEvmRpcUrl } from "./rpc";
import type { PhantomApiClient } from "@phantom/phantom-api-client";
import type { Logger } from "./logger";

/**
 * Slip44 identifier for the native token of each EVM chain as used by the Phantom quotes API.
 */
export const EVM_NATIVE_SLIP44: Record<string, string> = {
  "eip155:1": "60", // ETH — Ethereum mainnet
  "eip155:11155111": "60", // ETH — Sepolia
  "eip155:8453": "8453", // ETH — Base
  "eip155:84532": "84532", // ETH — Base Sepolia
  "eip155:42161": "9001", // ETH — Arbitrum One
  "eip155:421614": "9001", // ETH — Arbitrum Sepolia
  "eip155:137": "966", // MATIC — Polygon
  "eip155:80002": "966", // MATIC — Polygon Amoy
  "eip155:143": "143", // ETH — Monad mainnet
  "eip155:10143": "10143", // ETH — Monad testnet
};

export function decodeTransactionData(transactionData: string, base64Encoded: boolean | undefined): Uint8Array {
  if (base64Encoded) {
    const bytes = Buffer.from(transactionData, "base64");
    if (!bytes.length) throw new Error("Failed to decode base64 transaction data");
    return bytes;
  }
  try {
    return bs58.decode(transactionData);
  } catch (error) {
    const bytes = Buffer.from(transactionData, "base64");
    if (!bytes.length) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to decode transaction data: ${errorMessage}`);
    }
    return bytes;
  }
}

/**
 * Validates a token address for the given chain.
 * Solana: must be a valid base58 PublicKey.
 * EVM: must be a 0x-prefixed hex address.
 */
export function validateTokenAddress(address: string, chainId: string, paramName: string): void {
  if (isSolanaChain(chainId)) {
    try {
      new PublicKey(address);
    } catch {
      throw new Error(`${paramName} must be a valid Solana address`);
    }
  } else if (chainId.startsWith("eip155:")) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      throw new Error(`${paramName} must be a valid EVM address (0x-prefixed, 40 hex chars)`);
    }
  }
}

/**
 * Builds the token object for the Phantom quotes API.
 * Native tokens require slip44; EVM chains each have a specific coin type.
 */
export function buildTokenObject(
  chainId: string,
  mint: string | undefined,
  isNative: boolean,
): Record<string, unknown> {
  if (isNative) {
    if (isSolanaChain(chainId)) {
      return { chainId, resourceType: "nativeToken", slip44: "501" };
    }
    const slip44 = EVM_NATIVE_SLIP44[chainId];
    if (!slip44) {
      throw new Error(
        `Native token slip44 not configured for chain ${chainId}. Supported EVM chains: ${Object.keys(EVM_NATIVE_SLIP44).join(", ")}`,
      );
    }
    return { chainId, resourceType: "nativeToken", slip44 };
  }
  // Backend requires lowercase EVM addresses
  const normalizedMint = chainId.startsWith("eip155:") && mint ? mint.toLowerCase() : mint;
  return { chainId, resourceType: "address", address: normalizedMint };
}

// --- Quote fetching ---

export interface FetchQuoteOptions {
  sellChainId: string; // swapper chain ID
  buyChainId: string; // swapper chain ID
  sellToken: Record<string, unknown>;
  buyToken: Record<string, unknown>;
  taker: string;
  sellAmount?: string;
  buyAmount?: string;
  exactOut?: boolean;
  slippageTolerance?: number;
  autoSlippage?: boolean;
  base64EncodedTx?: boolean;
  apiClient: PhantomApiClient;
  logger: Logger;
  // For cross-chain
  takerDestination?: { chainId: string; resourceType: string; address: string };
  chainAddresses?: Record<string, string>;
}

export interface QuoteResult {
  quoteRequest: Record<string, unknown>;
  quoteResponse: PhantomQuotesResponse;
}

export async function fetchSwapQuote(options: FetchQuoteOptions): Promise<QuoteResult> {
  const {
    sellChainId,
    buyChainId,
    sellToken,
    buyToken,
    taker,
    sellAmount,
    buyAmount,
    exactOut,
    slippageTolerance,
    autoSlippage,
    base64EncodedTx,
    apiClient,
    logger,
    takerDestination,
    chainAddresses,
  } = options;

  const isCrossChain = sellChainId !== buyChainId;
  const isSellSolana = isSolanaChain(sellChainId);

  const body: Record<string, unknown> = {
    taker: { chainId: sellChainId, resourceType: "address", address: taker },
    buyToken,
    sellToken,
  };

  if (buyAmount) body.buyAmount = buyAmount;
  if (sellAmount) body.sellAmount = sellAmount;

  if (isCrossChain && takerDestination) {
    body.takerDestination = takerDestination;
    if (chainAddresses) body.chainAddresses = chainAddresses;
  }

  if (slippageTolerance !== undefined) body.slippageTolerance = slippageTolerance;
  if (exactOut !== undefined) body.exactOut = exactOut;
  body.autoSlippage = autoSlippage ?? true;
  if (base64EncodedTx !== undefined) body.base64EncodedTx = base64EncodedTx;

  logger.info(
    `Requesting ${isCrossChain ? "cross-chain" : isSellSolana ? "Solana" : "EVM"} quote (${sellChainId} → ${buyChainId})`,
  );

  const quoteResponse = await apiClient.post<PhantomQuotesResponse>("/swap/v2/quotes", body);

  return { quoteRequest: body, quoteResponse };
}

// --- Swap execution ---

export interface ExecuteSwapOptions {
  quoteResponse: PhantomQuotesResponse;
  sellChainId: string; // swapper format
  buyChainId: string; // swapper format
  rawSellChain: string; // original user format, for normalizeNetworkId
  taker: string;
  walletId: string;
  derivationIndex?: number;
  base64EncodedTx?: boolean;
  client: PhantomClient;
  logger: Logger;
  /** ERC-20 contract address of the sell token (undefined for native tokens). Used to check and send approval if needed. */
  sellTokenAddress?: string;
}

export interface SwapExecutionResult {
  signature: string | null;
  rawTransaction: string;
  explorerUrl: string | null;
}

export async function executeSwap(options: ExecuteSwapOptions): Promise<SwapExecutionResult> {
  const {
    quoteResponse,
    sellChainId,
    buyChainId,
    rawSellChain,
    taker,
    walletId,
    derivationIndex,
    base64EncodedTx,
    client,
    logger,
    sellTokenAddress,
  } = options;

  const isSellSolana = isSolanaChain(sellChainId);
  const isCrossChain = sellChainId !== buyChainId;

  if (
    typeof quoteResponse !== "object" ||
    quoteResponse === null ||
    !Array.isArray((quoteResponse as Record<string, unknown>).quotes)
  ) {
    throw new Error(
      `Quote response has unexpected format: expected object with quotes array, got ${typeof quoteResponse}`,
    );
  }

  const quotes = quoteResponse.quotes;
  if (quotes.length === 0) throw new Error("Quote response contains empty quotes array - no swaps available");

  logger.info("Signing and sending swap transaction");

  let signResult: { hash?: string; rawTransaction: string };

  if (isCrossChain) {
    const crossChainQuote = quotes[0] as CrossChainQuote;
    const step = crossChainQuote.steps?.[0];
    if (!step?.transactionData) {
      throw new Error(
        `Cross-chain quote missing transactionData in steps[0]. Quote: ${JSON.stringify(crossChainQuote)}`,
      );
    }

    if (isSellSolana) {
      const solanaStep = step as SolanaOriginCrossChainStep;
      const decoded = decodeTransactionData(solanaStep.transactionData, base64EncodedTx);
      const encoded = base64urlEncode(decoded);
      signResult = await client.signAndSendTransaction({
        walletId,
        transaction: encoded,
        networkId: normalizeNetworkId(rawSellChain) as NetworkId,
        derivationIndex,
        account: taker,
      });
    } else {
      const evmStep = step as EvmOriginCrossChainStep;
      if (!evmStep.exchangeAddress) {
        throw new Error(`Cross-chain EVM step missing exchangeAddress. Step: ${JSON.stringify(evmStep)}`);
      }
      const chainId = parseInt(sellChainId.split(":")[1], 10);
      const rpcUrl = resolveEvmRpcUrl(sellChainId);
      const [nonce, gasPrice] = await Promise.all([fetchNonce(rpcUrl, taker), fetchGasPrice(rpcUrl)]);
      let swapNonce = nonce;

      if (sellTokenAddress && evmStep.allowanceTarget) {
        swapNonce = await sendApprovalIfNeeded({
          rpcUrl,
          tokenAddress: sellTokenAddress,
          owner: taker,
          spender: evmStep.allowanceTarget,
          requiredAmount: BigInt(evmStep.approvalExactAmount ?? crossChainQuote.sellAmount),
          nonce,
          gasPrice,
          chainId,
          networkId: sellChainId as NetworkId,
          walletId,
          derivationIndex,
          client,
          logger,
        });
      }

      const txValue = "0x" + BigInt(evmStep.value ?? "0").toString(16);
      const baseTx: Record<string, unknown> = {
        from: taker,
        to: evmStep.exchangeAddress,
        value: txValue,
        data: evmStep.transactionData,
        chainId,
        nonce: swapNonce,
        gasPrice,
      };
      const txGas = evmStep.gasCosts?.[0];
      if (txGas != null && txGas > 0) {
        baseTx.gas = "0x" + txGas.toString(16);
      } else {
        baseTx.gas = await estimateGas(rpcUrl, {
          from: taker,
          to: evmStep.exchangeAddress,
          value: txValue,
          data: evmStep.transactionData,
        });
      }
      const { parsed: rlpHex } = await parseToKmsTransaction(baseTx, sellChainId as NetworkId);
      if (!rlpHex) throw new Error("Failed to RLP-encode EVM cross-chain swap transaction");
      signResult = await client.signAndSendTransaction({
        walletId,
        transaction: rlpHex,
        networkId: sellChainId as NetworkId,
        derivationIndex,
        account: taker,
      });
    }
  } else if (isSellSolana) {
    // Solana same-chain swap
    const solanaQuote = quotes[0] as SolanaQuote;
    const rawTxData = solanaQuote.transactionData;
    if (Array.isArray(rawTxData) && rawTxData.length > 1) {
      throw new Error(
        `Solana quote returned ${rawTxData.length} transactions; multi-transaction quotes are not yet supported`,
      );
    }
    const txData = Array.isArray(rawTxData) ? rawTxData[0] : rawTxData;
    if (!txData) {
      throw new Error(`Solana quote missing transactionData. Quote: ${JSON.stringify(solanaQuote)}`);
    }
    const decoded = decodeTransactionData(txData, base64EncodedTx);
    const encoded = base64urlEncode(decoded);
    signResult = await client.signAndSendTransaction({
      walletId,
      transaction: encoded,
      networkId: normalizeNetworkId(rawSellChain) as NetworkId,
      derivationIndex,
      account: taker,
    });
  } else {
    // EVM same-chain swap
    const evmQuote = quotes[0] as EvmSameChainQuote;
    const rawTxData = evmQuote.transactionData;
    if (Array.isArray(rawTxData) && rawTxData.length > 1) {
      throw new Error(
        `EVM quote returned ${rawTxData.length} transactions; multi-transaction quotes are not yet supported`,
      );
    }
    const txData = Array.isArray(rawTxData) ? rawTxData[0] : rawTxData;
    if (!txData) {
      throw new Error(`EVM quote missing transactionData. Quote: ${JSON.stringify(evmQuote)}`);
    }
    if (!evmQuote.exchangeAddress) {
      throw new Error(`EVM quote missing exchangeAddress. Quote: ${JSON.stringify(evmQuote)}`);
    }
    const chainId = parseInt(sellChainId.split(":")[1], 10);
    const rpcUrl = resolveEvmRpcUrl(sellChainId);
    const [nonce, gasPrice] = await Promise.all([fetchNonce(rpcUrl, taker), fetchGasPrice(rpcUrl)]);

    // Check ERC-20 allowance and send approval tx first if needed
    let swapNonce = nonce;
    if (sellTokenAddress && evmQuote.allowanceTarget) {
      swapNonce = await sendApprovalIfNeeded({
        rpcUrl,
        tokenAddress: sellTokenAddress,
        owner: taker,
        spender: evmQuote.allowanceTarget,
        requiredAmount: BigInt(evmQuote.approvalExactAmount ?? evmQuote.sellAmount),
        nonce,
        gasPrice,
        chainId,
        networkId: sellChainId as NetworkId,
        walletId,
        derivationIndex,
        client,
        logger,
      });
    }

    const txValue = "0x" + BigInt(evmQuote.value ?? "0").toString(16);
    const baseTx: Record<string, unknown> = {
      from: taker,
      to: evmQuote.exchangeAddress,
      value: txValue,
      data: txData,
      chainId,
      nonce: swapNonce,
      gasPrice,
    };
    if (evmQuote.gas != null && evmQuote.gas > 0) {
      baseTx.gas = "0x" + evmQuote.gas.toString(16);
    } else {
      baseTx.gas = await estimateGas(rpcUrl, {
        from: taker,
        to: evmQuote.exchangeAddress,
        value: txValue,
        data: txData,
      });
    }
    const { parsed: rlpHex } = await parseToKmsTransaction(baseTx, sellChainId as NetworkId);
    if (!rlpHex) throw new Error("Failed to RLP-encode EVM swap transaction");
    signResult = await client.signAndSendTransaction({
      walletId,
      transaction: rlpHex,
      networkId: sellChainId as NetworkId,
      derivationIndex,
      account: taker,
    });
  }

  const txHash = signResult.hash ?? null;
  logger.info(`Swap executed: ${txHash ?? "no hash returned"}`);

  const explorerUrl = txHash ? getExplorerTxUrl(sellChainId, txHash) : undefined;

  return {
    signature: txHash,
    rawTransaction: signResult.rawTransaction,
    explorerUrl: explorerUrl ?? null,
  };
}
