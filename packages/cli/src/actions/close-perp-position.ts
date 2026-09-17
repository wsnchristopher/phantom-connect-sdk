/**
 * close_perp_position tool
 *
 * Closes an existing perpetual position on Hyperliquid.
 */

import { ActionResponseSchema } from "@phantom/perps-client";
import { Cli, z } from "incur";
import { createAction } from "../utils/actions";
import { createPerpsClient } from "../utils/perps";
import { WalletIdSchema, DerivationIndexSchema, PercentageSchema } from "../utils/schemas";

const ClosePerpPositionSchema = z.object({
  market: z
    .string()
    .trim()
    .min(1, { message: "market is required" })
    .describe(
      'Market symbol of the position to close (e.g. "BTC"). For HIP-3 builder-deployed markets use "DEX:SYMBOL" format (e.g. "WOOF:BTC").',
    ),
  sizePercent: PercentageSchema.min(1)
    .default(100)
    .describe("Percentage of position to close (1–100, default: 100 for full close)"),
  walletId: WalletIdSchema.describe("Optional wallet ID (defaults to authenticated wallet)"),
  derivationIndex: DerivationIndexSchema.describe("Optional derivation index (default: 0)"),
});

const closePerpPositionAction = createAction({
  description:
    "Closes an open perpetual position on Hyperliquid. By default closes 100% of the position. " +
    "Use sizePercent to partially close (e.g. 50 to close half). " +
    "Uses a market IOC order with 10% slippage buffer.",
  options: ClosePerpPositionSchema,
  output: ActionResponseSchema,
  mcp: {
    command: "close_perp_position",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    },
  },
  run: async ({ options: params, var: context }) => {
    const walletId = params.walletId ?? context.manager.getSession().walletId;
    const perps = await createPerpsClient(context, walletId, params.derivationIndex);

    context.logger.info(`Closing ${params.sizePercent}% of ${params.market} perp position`);

    return perps.closePosition({
      market: params.market,
      sizePercent: params.sizePercent,
    });
  },
});

export const perpsCloseCommand = Cli.create("close", closePerpPositionAction.command);
export const closePerpPositionTool = closePerpPositionAction.tool;
