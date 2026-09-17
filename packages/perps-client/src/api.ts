/**
 * Thin HTTP wrapper for Phantom backend perps endpoints.
 * Logs every request and every error response body.
 */

import { z } from "zod";
import type { PerpsLogger } from "./logger";
import { noopLogger } from "./logger";
import {
  type PerpAccountBalance,
  type PerpPosition,
  type PerpOrder,
  type PerpMarket,
  type HistoricalOrder,
  type FundingActivity,
  type SignatureComponents,
  type HlOrderAction,
  type HlCancelAction,
  type HlUpdateLeverageAction,
  type HlUsdClassTransferAction,
  type HlOrderResponse,
  type HlDefaultResponse,
  type HlCancelOrderResponse,
  type RelayWithdrawalV2Quote,
  PerpAccountBalanceSchema,
  PerpPositionSchema,
  PerpOrderSchema,
  PerpMarketSchema,
  HistoricalOrderSchema,
  FundingActivitySchema,
  RelayWithdrawalV2QuoteSchema,
  HlDefaultResponseSchema,
  HlCancelOrderResponseSchema,
  HlOrderResponseSchema,
} from "./schemas";

/** Minimal interface compatible with PhantomApiClient from @phantom/phantom-api-client */
export interface ApiClient {
  get<T>(path: string, options?: { params?: Record<string, string> }): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
}

export interface PerpsApiOptions {
  logger?: PerpsLogger;
  apiClient: ApiClient;
}

export class PerpsApi {
  private readonly logger: PerpsLogger;
  private readonly apiClient: ApiClient;

  constructor(options: PerpsApiOptions) {
    this.logger = options.logger ?? noopLogger;
    this.apiClient = options.apiClient;
  }

  private async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    return this.apiClient.get<T>(path, { params });
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.apiClient.post<T>(path, body);
  }

  async getAccountBalance(user: string): Promise<PerpAccountBalance> {
    this.logger.info(`getAccountBalance user=${user}`);
    const data = await this.get("/swap/v2/perp/balance", { user });
    return PerpAccountBalanceSchema.parse(data);
  }

  async getFundingHistory(user: string): Promise<FundingActivity[]> {
    this.logger.info(`getFundingHistory user=${user}`);
    const data = await this.get("/swap/v2/perp/deposits-and-withdrawals", { user });
    const parsed = FundingHistoryResponseSchema.parse(data);
    return parsed.depositAndWithdrawals.map(mapFundingActivity);
  }

  async getPositionsAndOpenOrders(user: string): Promise<{ positions: PerpPosition[]; openOrders: PerpOrder[] }> {
    this.logger.info(`getPositionsAndOpenOrders user=${user}`);
    const data = await this.get("/swap/v2/perp/positions-and-open-orders", { user });
    const parsed = PositionsAndOrdersResponseSchema.parse(data);
    return {
      positions: parsed.positions.map(mapPosition),
      openOrders: parsed.openOrders.map(mapOpenOrder),
    };
  }

  async getTradeHistory(user: string): Promise<HistoricalOrder[]> {
    this.logger.info(`getTradeHistory user=${user}`);
    const data = await this.get("/swap/v2/perp/trade-history", { user });
    const parsed = TradeHistoryResponseSchema.parse(data);
    return parsed.tradeHistory.map(mapHistoricalOrder);
  }

  /**
   * Fetch specific markets by CAIP-19 token address (e.g. "hypercore:mainnet/address:BTC").
   * The backend requires at least one token — this is for targeted lookups.
   */
  async getMarkets(tokens: string[]): Promise<PerpMarket[]> {
    this.logger.info(`getMarkets tokens=${tokens.join(",")}`);
    const data = await this.get("/swap/v2/perp/markets", {
      tokens: tokens.join(","),
    });
    const parsed = MarketsResponseSchema.parse(data);
    // The API returns either an array or a keyed record depending on version
    const items = Array.isArray(parsed.markets) ? parsed.markets : Object.values(parsed.markets);
    return items.map(mapMarket);
  }

  /**
   * Fetch trending/popular markets (no per-market tokens needed).
   * Requires chainId, sortBy, sortDirection per backend DTO.
   */
  async getTrendingMarkets(): Promise<PerpMarket[]> {
    this.logger.info(`getTrendingMarkets`);
    const data = await this.get("/swap/v2/perp/trending-markets", {
      chainId: "hypercore:mainnet",
      sortBy: "trending",
      sortDirection: "desc",
    });
    const parsed = TrendingMarketsResponseSchema.parse(data);
    return parsed.trendingMarkets.map(mapMarket);
  }

  /**
   * Fetch all available markets via the market-lists endpoint.
   * Deduplicates across categories so each market symbol appears once.
   */
  async getAllMarkets(): Promise<PerpMarket[]> {
    this.logger.info(`getAllMarkets`);
    const data = await this.get("/swap/v2/perp/market-lists");
    const parsed = MarketListsResponseSchema.parse(data);
    const seen = new Set<string>();
    const markets: PerpMarket[] = [];
    for (const category of Object.values(parsed)) {
      for (const raw of category.markets) {
        if (!seen.has(raw.symbol)) {
          seen.add(raw.symbol);
          markets.push(mapMarket(raw));
        }
      }
    }
    return markets;
  }

  /**
   * POST /swap/v2/exchange — place a single order (open/close position).
   * Uses the maintained exchange proxy endpoint; taker is not required.
   */
  async postPlaceOrder(body: {
    action: HlOrderAction;
    nonce: number;
    signature: SignatureComponents;
  }): Promise<HlOrderResponse> {
    this.logger.info(`postPlaceOrder nonce=${body.nonce}`);
    const data = await this.post("/swap/v2/exchange", body);
    return HlOrderResponseSchema.parse(data);
  }

  /**
   * POST /swap/v2/exchange — cancel an open order.
   * Uses the maintained exchange proxy endpoint; taker is not required.
   */
  async postCancelOrder(body: {
    action: HlCancelAction;
    nonce: number;
    signature: SignatureComponents;
  }): Promise<HlCancelOrderResponse> {
    this.logger.info(`postCancelOrder nonce=${body.nonce}`);
    const data = await this.post("/swap/v2/exchange", body);
    return HlCancelOrderResponseSchema.parse(data);
  }

  /**
   * POST /swap/v2/exchange — update leverage for a market.
   * Uses the maintained exchange proxy endpoint; taker is not required.
   */
  async postUpdateLeverage(body: {
    action: HlUpdateLeverageAction;
    nonce: number;
    signature: SignatureComponents;
  }): Promise<HlDefaultResponse> {
    this.logger.info(`postUpdateLeverage asset=${body.action.asset} leverage=${body.action.leverage}`);
    const data = await this.post("/swap/v2/exchange", body);
    return HlDefaultResponseSchema.parse(data);
  }

  async postTransferUsdcSpotPerp(body: {
    action: HlUsdClassTransferAction;
    nonce: number;
    signature: SignatureComponents;
  }): Promise<HlDefaultResponse> {
    this.logger.info(`postTransferUsdcSpotPerp amount=${body.action.amount} toPerp=${body.action.toPerp}`);
    const data = await this.post("/swap/v2/exchange", body);
    return HlDefaultResponseSchema.parse(data);
  }

  async getBridgeInitialize(params: {
    buyToken: string;
    takerDestination: string;
    sellAmount: string;
    sourceWallet: string;
  }): Promise<RelayWithdrawalV2Quote> {
    this.logger.info(`getBridgeInitialize sellAmount=${params.sellAmount} dest=${params.takerDestination}`);
    const data = await this.get("/swap/v2/spot/bridge-initialize", {
      ...params,
      bridgeProvider: "RelayV2",
    });
    return RelayWithdrawalV2QuoteSchema.parse(data);
  }

  async postAuthorize(endpoint: string, body: Record<string, unknown>): Promise<unknown> {
    this.logger.info(`postAuthorize endpoint=${endpoint}`);
    return this.post(endpoint, body);
  }

  async postSpotSend(body: {
    action: Record<string, unknown>;
    nonce: number;
    signature: SignatureComponents;
  }): Promise<unknown> {
    this.logger.info(`postSpotSend nonce=${body.nonce}`);
    return this.post("/swap/v2/exchange", body);
  }
}

const RawPositionSchema = z.object({
  direction: z.enum(["long", "short"]),
  leverage: z.string(),
  size: z.string(),
  margin: z.string(),
  entryPrice: z.string(),
  fundingPayments: z.string().optional(),
  market: z.object({
    token: z.object({ address: z.string(), chainId: z.string().optional() }),
    logoUri: z.string().optional(),
  }),
  unrealizedPnl: z.object({ amount: z.string(), percentage: z.string().optional() }).nullable(),
  liquidationPrice: z.string().nullish(),
});

const RawOpenOrderSchema = z.object({
  id: z.string(),
  market: z.object({ token: z.object({ address: z.string() }) }),
  isTrigger: z.boolean().optional(),
  direction: z.enum(["long", "short"]),
  type: z.enum(["limit", "take_profit_market", "stop_market"]),
  limitPrice: z.string(),
  triggerPrice: z.string().optional(),
  size: z.string(),
  reduceOnly: z.boolean(),
  /** Backend sends timestamp as a string. */
  timestamp: z.string(),
});

const PositionsAndOrdersResponseSchema = z.object({
  positions: z.array(RawPositionSchema),
  openOrders: z.array(RawOpenOrderSchema),
});

const RawHistoricalOrderSchema = z.object({
  id: z.string(),
  market: z.object({
    token: z.object({ address: z.string(), chainId: z.string().optional() }),
    logoUri: z.string().optional(),
    szDecimals: z.number().optional(),
  }),
  type: z.string(),
  timestamp: z.number(),
  price: z.string(),
  size: z.string(),
  tradeValue: z.string(),
  fee: z.string(),
  closedPnl: z.string().optional(),
});

const TradeHistoryResponseSchema = z.object({
  tradeHistory: z.array(RawHistoricalOrderSchema),
});

const RawMarketSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  token: z.object({
    chainId: z.string(),
    resourceType: z.string(),
    address: z.string(),
  }),
  logoUri: z.string(),
  szDecimals: z.number(),
  maxLeverage: z.number(),
  price: z.string(),
  priceChange24h: z.object({
    amount: z.string(),
    percentage: z.string(),
  }),
  volume24h: z.string(),
  openInterest: z.string(),
  isAtOpenInterestCap: z.boolean(),
  fundingRate: z.string(),
  description: z.string().optional(),
  collateralToken: z.object({ tokenIndex: z.number(), pairIndex: z.number() }).optional(),
  /** Present when the backend includes the asset index; not formally exposed in the DTO. */
  assetId: z.number().optional(),
});

const MarketsResponseSchema = z.object({
  markets: z.union([z.array(RawMarketSchema), z.record(z.string(), RawMarketSchema)]),
});

const TrendingMarketsResponseSchema = z.object({
  trendingMarkets: z.array(RawMarketSchema),
});

const MarketListsResponseSchema = z.record(z.string(), z.object({ markets: z.array(RawMarketSchema) }));

/** Raw shape of a single deposit-or-withdrawal item from the backend. */
const RawFundingActivitySchema = z.object({
  id: z.string(),
  type: z.string(),
  /** Amount in USDC. */
  usdcAmount: z.string(),
  timestamp: z.number(),
});

const FundingHistoryResponseSchema = z.object({
  depositAndWithdrawals: z.array(RawFundingActivitySchema),
});

// ── Raw → public type mappers ─────────────────────────────────────────────────

type RawPosition = z.infer<typeof RawPositionSchema>;

function mapPosition(raw: RawPosition): PerpPosition {
  return PerpPositionSchema.parse({
    coin: raw.market.token.address,
    direction: raw.direction,
    size: raw.size,
    margin: raw.margin,
    entryPrice: raw.entryPrice,
    leverage: { type: "unknown", value: raw.leverage },
    unrealizedPnl: raw.unrealizedPnl?.amount ?? "0",
    liquidationPrice: raw.liquidationPrice || null,
  });
}

type RawOpenOrder = z.infer<typeof RawOpenOrderSchema>;

function mapOpenOrder(raw: RawOpenOrder): PerpOrder {
  return PerpOrderSchema.parse({
    id: raw.id,
    coin: raw.market.token.address,
    side: raw.direction,
    type: raw.type,
    isTrigger: raw.isTrigger ?? false,
    limitPrice: raw.limitPrice,
    triggerPrice: raw.triggerPrice,
    size: raw.size,
    reduceOnly: raw.reduceOnly,
    timestamp: raw.timestamp,
  });
}

type RawHistoricalOrder = z.infer<typeof RawHistoricalOrderSchema>;

function mapHistoricalOrder(raw: RawHistoricalOrder): HistoricalOrder {
  return HistoricalOrderSchema.parse({
    id: raw.id,
    coin: raw.market.token.address,
    type: raw.type,
    timestamp: raw.timestamp,
    price: raw.price,
    size: raw.size,
    tradeValue: raw.tradeValue,
    fee: raw.fee,
    closedPnl: raw.closedPnl,
  });
}

type RawMarket = z.infer<typeof RawMarketSchema>;

function mapMarket(raw: RawMarket): PerpMarket {
  return PerpMarketSchema.parse({
    symbol: raw.symbol,
    name: raw.name,
    assetId: raw.assetId,
    maxLeverage: raw.maxLeverage,
    szDecimals: raw.szDecimals,
    price: raw.price,
    priceChange24h: raw.priceChange24h,
    fundingRate: raw.fundingRate,
    openInterest: raw.openInterest,
    volume24h: raw.volume24h,
    isAtOpenInterestCap: raw.isAtOpenInterestCap,
    ...(raw.description !== undefined ? { description: raw.description } : {}),
    ...(raw.collateralToken !== undefined ? { collateralToken: raw.collateralToken } : {}),
  });
}

type RawFundingActivity = z.infer<typeof RawFundingActivitySchema>;

function mapFundingActivity(raw: RawFundingActivity): FundingActivity {
  return FundingActivitySchema.parse({
    id: raw.id,
    type: raw.type,
    amount: raw.usdcAmount,
    timestamp: raw.timestamp,
  });
}
