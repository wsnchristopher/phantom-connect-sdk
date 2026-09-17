/**
 * get_perp_positions tool
 *
 * Returns open perpetual positions for the authenticated wallet.
 */

import { PerpPositionSchema } from "@phantom/perps-client";
import { Cli, z } from "incur";
import { createAction } from "../utils/actions";
import { createPerpsClient } from "../utils/perps";
import { WalletIdSchema, DerivationIndexSchema } from "../utils/schemas";

const GetPerpPositionsSchema = z.object({
  walletId: WalletIdSchema.describe("Optional wallet ID (defaults to authenticated wallet)"),
  derivationIndex: DerivationIndexSchema.describe("Optional derivation index (default: 0)"),
});

const getPerpPositionsAction = createAction({
  description:
    "Returns all open perpetual positions for the wallet. Each position includes coin, direction (long/short), size, margin, entry price, leverage, unrealized PnL, and liquidation price.",
  options: GetPerpPositionsSchema,
  output: z.array(PerpPositionSchema),
  mcp: {
    command: "get_perp_positions",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  run: async ({ options: params, var: context }) => {
    const walletId = params.walletId ?? context.manager.getSession().walletId;

    const perps = await createPerpsClient(context, walletId, params.derivationIndex);
    return perps.getPositions();
  },
});

export const perpsPositionsCommand = Cli.create("positions", getPerpPositionsAction.command);
export const getPerpPositionsTool = getPerpPositionsAction.tool;
