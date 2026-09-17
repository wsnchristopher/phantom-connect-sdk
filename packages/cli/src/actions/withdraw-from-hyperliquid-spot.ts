/**
 * withdraw_from_hyperliquid_spot tool
 *
 * Bridges USDC from the Hyperliquid spot wallet to an external chain via the Relay V2 bridge.
 * Delegates all signing and submission logic to PerpsClient.withdrawFromSpot().
 *
 * Note: funds must be in the spot account before calling this tool.
 * Use withdraw_from_perps first if funds are in the perp account.
 */

import { WithdrawFromSpotResultSchema } from "@phantom/perps-client";
import { Cli, z } from "incur";
import { createAction } from "../utils/actions";
import { createPerpsClient } from "../utils/perps";
import { getEthereumAddress } from "../utils/evm";
import { getSolanaAddress } from "../utils/solana";
import { isSolanaChain } from "@phantom/utils";
import { normalizeSwapperChainId } from "../utils/network";
import {
  WalletIdSchema,
  DerivationIndexSchema,
  Caip2ChainIdSchema,
  Caip19Schema,
  PositiveNumericStringSchema,
} from "../utils/schemas";

const WithdrawFromHyperliquidSpotSchema = z.object({
  amountUsdc: PositiveNumericStringSchema.describe('Amount of USDC to bridge out (e.g. "8.0" for 8 USDC)'),
  destinationChainId: Caip2ChainIdSchema.describe(
    'Destination chain CAIP-2 ID. Examples: "solana:mainnet", "eip155:8453" (Base), ' +
      '"eip155:1" (Ethereum), "eip155:42161" (Arbitrum), "eip155:137" (Polygon).',
  ),
  buyToken: Caip19Schema.optional().describe(
    'CAIP-19 token to receive on the destination chain (e.g. "solana:101/token:EPjFWdd5..."). ' +
      "Defaults to USDC on the destination chain if omitted.",
  ),
  execute: z
    .union([z.boolean(), z.stringbool()])
    .default(false)
    .describe("If false (default), returns the quote only. If true, signs and broadcasts immediately."),
  walletId: WalletIdSchema.describe("Optional wallet ID (defaults to authenticated wallet)"),
  derivationIndex: DerivationIndexSchema.describe("Optional derivation index (default: 0)"),
});

const WithdrawFromHyperliquidSpotOutputSchema = z.union([
  z.object({
    quote: z.object({
      requestId: z.string(),
      authorizeStep: z.unknown(),
      depositStep: z.unknown(),
      details: z.object({
        amountIn: z.string(),
        amountOut: z.string(),
        amountOutUsd: z.string().optional(),
      }),
    }),
  }),
  WithdrawFromSpotResultSchema,
]);

const withdrawFromHyperliquidSpotAction = createAction({
  description:
    "Bridges USDC from the Hyperliquid spot wallet to an external chain (Solana, Base, Ethereum, Arbitrum, Polygon) " +
    "via the Relay bridge. Funds must be in the Hyperliquid spot account — use withdraw_from_perps first if they " +
    "are in the perp account. " +
    "By default receives USDC on the destination chain; pass buyToken to receive a different asset. " +
    "Use execute: false (default) to preview the quote first.",
  options: WithdrawFromHyperliquidSpotSchema,
  output: WithdrawFromHyperliquidSpotOutputSchema,
  mcp: {
    command: "withdraw_from_hyperliquid_spot",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    },
  },
  run: async ({ options: params, var: context }) => {
    const { logger } = context;
    const session = context.manager.getSession();

    const walletId = params.walletId ?? session.walletId;

    const derivationIndex = params.derivationIndex;
    const execute = params.execute;

    const normalizedDestChain = normalizeSwapperChainId(params.destinationChainId);
    const isSolanaDestination = isSolanaChain(normalizedDestChain);

    const destinationAddress = isSolanaDestination
      ? await getSolanaAddress(context, walletId, derivationIndex)
      : await getEthereumAddress(context, walletId, derivationIndex);

    const perps = await createPerpsClient(context, walletId, derivationIndex);

    const withdrawParams = {
      amountUsdc: params.amountUsdc,
      destinationChainId: normalizedDestChain,
      destinationAddress,
      buyToken: params.buyToken,
    };

    if (!execute) {
      logger.info("withdraw_from_hyperliquid_spot: returning quote only (execute: false)");
      const quote = await perps.getWithdrawFromSpotQuote(withdrawParams);
      return { quote };
    }

    return perps.withdrawFromSpot(withdrawParams);
  },
});

export const perpsWithdrawHlSpotCommand = Cli.create("withdraw-hl-spot", withdrawFromHyperliquidSpotAction.command);
export const withdrawFromHyperliquidSpotTool = withdrawFromHyperliquidSpotAction.tool;
