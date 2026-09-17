/**
 * Zod schemas for all PerpsClient types.
 * Every exported type in this package is derived from a schema defined here.
 */

import { z } from "zod";

const DexBalanceSchema = z.object({
  accountValue: z.string().describe("Total account value denominated in USDC for this DEX."),
  availableBalance: z.string().describe("Available (withdrawable) balance in USDC for this DEX."),
  availableToTrade: z.string().describe("Available-to-trade balance in USDC for this DEX."),
});

const CollateralBalanceSchema = z.object({
  tokenIndex: z.number().describe("Hyperliquid token index for this collateral asset."),
  pairIndex: z.number().optional().describe("Pair index when the collateral is a spot-perp pair."),
  symbol: z.string().describe('Token symbol (e.g. "PURR").'),
  total: z.string().describe("Total collateral balance held."),
  hold: z.string().describe("Amount currently locked as margin."),
});

export type PerpAccountBalance = z.infer<typeof PerpAccountBalanceSchema>;

export const PerpAccountBalanceSchema = z.object({
  accountValue: z.string().describe("Total account value in USDC across all positions and unrealized PnL."),
  availableBalance: z.string().describe("USDC available to withdraw from the perps account."),
  availableToTrade: z.string().describe("USDC available to open new positions."),
  dexs: z
    .record(z.string(), DexBalanceSchema)
    .describe('Per-DEX balances keyed by DEX name (e.g. "WOOF"). Empty record when no HIP-3 positions exist.'),
  dexAbstraction: z
    .boolean()
    .optional()
    .describe("True when the account uses DEX abstraction mode (balances are aggregated across DEXes)."),
  collateralBalances: z
    .array(CollateralBalanceSchema)
    .optional()
    .describe("Non-USDC collateral token balances when whitelisted collateral is held."),
});

export type PerpPosition = z.infer<typeof PerpPositionSchema>;

export const PerpPositionSchema = z.object({
  coin: z.string(),
  direction: z.enum(["long", "short"]),
  size: z.string(),
  margin: z.string(),
  entryPrice: z.string(),
  leverage: z.object({
    type: z.enum(["isolated", "cross", "unknown"]),
    value: z.coerce.number(),
  }),
  unrealizedPnl: z.string(),
  liquidationPrice: z.string().nullable(),
});

export type PerpOrder = z.infer<typeof PerpOrderSchema>;

export const PerpOrderSchema = z.object({
  id: z.string(),
  coin: z.string(),
  side: z.enum(["long", "short"]),
  type: z.enum(["limit", "take_profit_market", "stop_market"]),
  isTrigger: z.boolean(),
  limitPrice: z.string(),
  triggerPrice: z.string().optional(),
  size: z.string(),
  reduceOnly: z.boolean(),
  timestamp: z.coerce.number(),
});

export type PerpMarket = z.infer<typeof PerpMarketSchema>;

export const PerpMarketSchema = z.object({
  symbol: z
    .string()
    .describe(
      'Market symbol. Standard markets use simple symbols (e.g. "BTC", "ETH"). HIP-3 builder-deployed markets use "DEX:SYMBOL" format (e.g. "xyz:SP500", "WOOF:BTC").',
    ),
  name: z.string().describe("Human-readable market name."),
  assetId: z
    .number()
    .optional()
    .describe(
      "Numeric Hyperliquid asset index used to construct orders. Not guaranteed by the backend DTO — guard before use.",
    ),
  maxLeverage: z.number().describe("Maximum leverage allowed for this market."),
  szDecimals: z.number().describe("Number of decimal places for order size on this market."),
  price: z.string().describe("Current mark price in USD."),
  priceChange24h: z.object({
    amount: z.string().describe("Absolute price change over the last 24 hours in USD."),
    percentage: z.string().describe("Percentage price change over the last 24 hours."),
  }),
  fundingRate: z.string().describe('Current 1-hour funding rate as a decimal (e.g. "0.0001" = 0.01%).'),
  openInterest: z.string().describe("Total open interest in USD."),
  volume24h: z.string().describe("Total trading volume over the last 24 hours in USD."),
  isAtOpenInterestCap: z
    .boolean()
    .describe("True when the market has reached its open interest cap and new longs cannot be opened."),
  description: z.string().optional().describe("Optional human-readable description of the market."),
  collateralToken: z
    .object({
      tokenIndex: z.number().describe("Hyperliquid token index for the collateral asset."),
      pairIndex: z.number().describe("Pair index for the collateral token."),
    })
    .optional()
    .describe("Present when the market uses a non-USDC collateral token (HIP-3 whitelisted collateral)."),
});

export type HistoricalOrder = z.infer<typeof HistoricalOrderSchema>;

export const HistoricalOrderSchema = z.object({
  id: z.string(),
  coin: z.string(),
  type: z.string(),
  timestamp: z.number(),
  price: z.string(),
  size: z.string(),
  tradeValue: z.string(),
  fee: z.string(),
  closedPnl: z.string().optional(),
});

export type FundingActivity = z.infer<typeof FundingActivitySchema>;

export const FundingActivitySchema = z.object({
  /** CAIP-19 encoded transaction ID */
  id: z.string().optional(),
  type: z.string(),
  /** USDC amount for this deposit or withdrawal */
  amount: z.string(),
  timestamp: z.number(),
});

export type ActionResponse = z.infer<typeof ActionResponseSchema>;

export const ActionResponseSchema = z.object({
  status: z.string(),
  data: z.unknown().optional(),
});

export type WithdrawFromSpotResult = z.infer<typeof WithdrawFromSpotResultSchema>;

export const WithdrawFromSpotResultSchema = z.object({
  requestId: z.string(),
  details: z.object({
    amountIn: z.string(),
    amountOut: z.string(),
    amountOutUsd: z.string().optional(),
  }),
  checkEndpoint: z.string(),
  execution: z.unknown(),
});

// Reused helper — not exported (internal to schema definitions below).
const Eip712FieldSchema = z.object({ name: z.string(), type: z.string() });

export type RelayWithdrawalV2Quote = z.infer<typeof RelayWithdrawalV2QuoteSchema>;

export const RelayWithdrawalV2QuoteSchema = z.object({
  requestId: z.string(),
  authorizeStep: z.object({
    id: z.literal("authorize"),
    domain: z.object({
      name: z.string(),
      version: z.string(),
      chainId: z.number(),
      verifyingContract: z.string(),
    }),
    types: z.record(z.string(), z.array(Eip712FieldSchema)),
    primaryType: z.string(),
    message: z.record(z.string(), z.unknown()),
    postEndpoint: z.string(),
    postBody: z.record(z.string(), z.unknown()),
  }),
  depositStep: z.object({
    id: z.literal("deposit"),
    action: z.record(z.string(), z.unknown()),
    nonce: z.number(),
    eip712Types: z.record(z.string(), z.array(Eip712FieldSchema)),
    eip712PrimaryType: z.string(),
    checkEndpoint: z.string(),
  }),
  details: z.object({
    amountIn: z.string(),
    amountOut: z.string(),
    amountOutUsd: z.string().optional(),
  }),
});

// ── Internal types for EIP-712 and action submission ─────────────────────────

// ── Signing and EIP-712 ───────────────────────────────────────────────────────

export type SignatureComponents = z.infer<typeof SignatureComponentsSchema>;

export const SignatureComponentsSchema = z.object({
  r: z.string(),
  s: z.string(),
  v: z.number(),
});

export type Eip712TypedData = z.infer<typeof Eip712TypedDataSchema>;

export const Eip712TypedDataSchema = z.object({
  domain: z.object({
    name: z.string(),
    version: z.string(),
    chainId: z.number(),
    verifyingContract: z.string(),
  }),
  primaryType: z.string(),
  types: z.record(z.string(), z.array(Eip712FieldSchema)),
  message: z.record(z.string(), z.unknown()),
});

// ── Low-level Hyperliquid order structs (mirrors wallet2's order.ts) ─────────

const TimeInForceSchema = z.enum(["Alo", "Ioc", "Gtc"]);

const LimitOrderTypeSchema = z.object({
  limit: z.object({ tif: TimeInForceSchema }),
});

const TriggerOrderTypeSchema = z.object({
  trigger: z.object({
    isMarket: z.boolean(),
    triggerPx: z.string(),
    tpsl: z.enum(["tp", "sl"]),
  }),
});

export type HlOrder = z.infer<typeof HlOrderSchema>;

export const HlOrderSchema = z.object({
  a: z.number(), // asset id
  b: z.boolean(), // isBuy
  p: z.string(), // price
  s: z.string(), // size
  r: z.boolean(), // reduceOnly
  t: z.union([LimitOrderTypeSchema, TriggerOrderTypeSchema]),
});

export type HlOrderAction = z.infer<typeof HlOrderActionSchema>;

export const HlOrderActionSchema = z.object({
  type: z.literal("order"),
  orders: z.array(HlOrderSchema),
  grouping: z.literal("na"),
});

export type HlCancelAction = z.infer<typeof HlCancelActionSchema>;

export const HlCancelActionSchema = z.object({
  type: z.literal("cancel"),
  cancels: z.array(z.object({ a: z.number(), o: z.number() })),
});

export type HlUpdateLeverageAction = z.infer<typeof HlUpdateLeverageActionSchema>;

export const HlUpdateLeverageActionSchema = z.object({
  type: z.literal("updateLeverage"),
  asset: z.number(),
  isCross: z.boolean(),
  leverage: z.number(),
});

export type HlUsdClassTransferAction = z.infer<typeof HlUsdClassTransferActionSchema>;

export const HlUsdClassTransferActionSchema = z.object({
  type: z.literal("usdClassTransfer"),
  hyperliquidChain: z.enum(["Mainnet", "Testnet"]),
  signatureChainId: z.enum(["0xa4b1", "0x66eee"]),
  amount: z.string(),
  toPerp: z.boolean(),
  nonce: z.number(),
});

export type HlAction = z.infer<typeof HlActionSchema>;

export const HlActionSchema = z.discriminatedUnion("type", [
  HlOrderActionSchema,
  HlCancelActionSchema,
  HlUpdateLeverageActionSchema,
  HlUsdClassTransferActionSchema,
]);

// ── Hyperliquid POST response schemas ─────────────────────────────────────────

/** Response from cancel-order, update-leverage, and transfer-usdc-spot-perp endpoints. */
export type HlDefaultResponse = z.infer<typeof HlDefaultResponseSchema>;

export const HlDefaultResponseSchema = z.object({
  status: z.string(),
  response: z.object({ type: z.string() }),
});

/** Response from cancel-order endpoint. */
export type HlCancelOrderResponse = z.infer<typeof HlCancelOrderResponseSchema>;

export const HlCancelOrderResponseSchema = z.object({
  status: z.string(),
  response: z.object({
    type: z.string(),
    data: z.object({
      statuses: z.array(z.union([z.string(), z.object({ error: z.string() })])),
    }),
  }),
});

/** Response from POST /swap/v2/place-order (matches backend OrderResponse DTO) */
export type HlOrderResponseStatus = z.infer<typeof HlOrderResponseStatusSchema>;

export const HlOrderResponseStatusSchema = z
  .object({
    resting: z.object({ oid: z.number() }).optional(),
    filled: z.object({ totalSz: z.string(), avgPx: z.string(), oid: z.number() }).optional(),
    error: z.string().optional(),
  })
  .refine(s => [s.resting, s.filled, s.error].filter(v => v !== undefined).length === 1, {
    message: "HlOrderResponseStatus must include exactly one of resting, filled, or error",
  });

export type HlOrderResponse = z.infer<typeof HlOrderResponseSchema>;

export const HlOrderResponseSchema = z.object({
  status: z.string(),
  response: z.object({
    type: z.string(),
    data: z.object({ statuses: z.array(HlOrderResponseStatusSchema) }),
  }),
  filled: z.object({ totalSz: z.string(), avgPx: z.string(), oid: z.number() }).optional(),
});

// ── Input param schemas ───────────────────────────────────────────────────────

export type OpenPositionParams = z.infer<typeof OpenPositionParamsSchema>;

export const OpenPositionParamsSchema = z.object({
  /** Coin symbol e.g. "BTC", "ETH" */
  market: z.string(),
  direction: z.enum(["long", "short"]),
  /** Size in USD */
  sizeUsd: z.string(),
  leverage: z.number(),
  /** Margin type — defaults to "isolated" (safer). Use "cross" to share account balance across positions. */
  marginType: z.enum(["isolated", "cross"]).optional(),
  orderType: z.enum(["market", "limit"]),
  limitPrice: z.string().optional(),
  reduceOnly: z.boolean().optional(),
});

export type ClosePositionParams = z.infer<typeof ClosePositionParamsSchema>;

export const ClosePositionParamsSchema = z.object({
  market: z.string(),
  /** 0-100, defaults to 100 (full close) */
  sizePercent: z.number().optional(),
});

export type CancelOrderParams = z.infer<typeof CancelOrderParamsSchema>;

export const CancelOrderParamsSchema = z.object({
  market: z.string(),
  orderId: z.number(),
});

export type UpdateLeverageParams = z.infer<typeof UpdateLeverageParamsSchema>;

export const UpdateLeverageParamsSchema = z.object({
  market: z.string(),
  leverage: z.number(),
  marginType: z.enum(["cross", "isolated"]),
});

// --- Hyperliquid spot withdrawal via Relay V2 bridge ---
export type WithdrawFromSpotParams = z.infer<typeof WithdrawFromSpotParamsSchema>;

export const WithdrawFromSpotParamsSchema = z.object({
  /** Human-readable USDC amount (e.g. "8.0") */
  amountUsdc: z.string(),
  /** Destination chain in CAIP-2 format (e.g. "solana:101", "eip155:8453") */
  destinationChainId: z.string(),
  /** Pre-resolved destination wallet address (Solana base58 or EVM 0x hex) */
  destinationAddress: z.string(),
  /** CAIP-19 token to receive on the destination chain. Defaults to USDC. */
  buyToken: z.string().optional(),
});
