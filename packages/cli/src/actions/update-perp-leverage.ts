/**
 * update_perp_leverage tool
 *
 * Updates leverage and margin type for a perpetual market on Hyperliquid.
 */

import { ActionResponseSchema } from "@phantom/perps-client";
import { Cli, z } from "incur";
import { createAction } from "../utils/actions";
import { createPerpsClient } from "../utils/perps";
import { WalletIdSchema, DerivationIndexSchema } from "../utils/schemas";

const UpdatePerpLeverageSchema = z.object({
  market: z
    .string()
    .trim()
    .min(1, { message: "market is required" })
    .describe(
      'Market symbol (e.g. "BTC"). For HIP-3 builder-deployed markets use "DEX:SYMBOL" format (e.g. "WOOF:BTC").',
    ),
  leverage: z.coerce.number().min(1).describe("Leverage multiplier (e.g. 1 for 1x, 10 for 10x)"),
  marginType: z
    .enum(["cross", "isolated"])
    .describe("Margin type: 'cross' shares balance, 'isolated' caps risk per-position"),
  walletId: WalletIdSchema.describe("Optional wallet ID (defaults to authenticated wallet)"),
  derivationIndex: DerivationIndexSchema.describe("Optional derivation index (default: 0)"),
});

const updatePerpLeverageAction = createAction({
  description:
    "Updates the leverage and margin type (cross or isolated) for a perpetual market. " +
    "This takes effect for new orders on that market. Cross margin shares account balance across positions; " +
    "isolated margin limits risk to the margin allocated to that position.",
  options: UpdatePerpLeverageSchema,
  output: ActionResponseSchema,
  mcp: {
    command: "update_perp_leverage",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    },
  },
  run: async ({ options: params, var: context }) => {
    const walletId = params.walletId ?? context.manager.getSession().walletId;
    const perps = await createPerpsClient(context, walletId, params.derivationIndex);

    context.logger.info(`Updating ${params.market} leverage to ${params.leverage}x ${params.marginType}`);

    return perps.updateLeverage({
      market: params.market,
      leverage: params.leverage,
      marginType: params.marginType,
    });
  },
});

export const perpsLeverageCommand = Cli.create("leverage", updatePerpLeverageAction.command);
export const updatePerpLeverageTool = updatePerpLeverageAction.tool;
