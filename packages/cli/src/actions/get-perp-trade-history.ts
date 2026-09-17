/**
 * get_perp_trade_history tool
 *
 * Returns trade history for the authenticated wallet's perpetuals account.
 */

import { HistoricalOrderSchema } from "@phantom/perps-client";
import { Cli, z } from "incur";
import { createAction } from "../utils/actions";
import { createPerpsClient } from "../utils/perps";
import { WalletIdSchema, DerivationIndexSchema } from "../utils/schemas";

const GetPerpTradeHistorySchema = z.object({
  walletId: WalletIdSchema.describe("Optional wallet ID (defaults to authenticated wallet)"),
  derivationIndex: DerivationIndexSchema.describe("Optional derivation index (default: 0)"),
});

const getPerpTradeHistoryAction = createAction({
  description:
    "Returns historical perpetual trades for the wallet. Each entry includes trade ID, coin, type (open/close/liquidation), timestamp, price, size, trade value, fee, and closed PnL.",
  options: GetPerpTradeHistorySchema,
  output: z.array(HistoricalOrderSchema),
  mcp: {
    command: "get_perp_trade_history",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  run: async ({ options: params, var: context }) => {
    const walletId = params.walletId ?? context.manager.getSession().walletId;

    const perps = await createPerpsClient(context, walletId, params.derivationIndex);
    return perps.getTradeHistory();
  },
});

export const perpsHistoryCommand = Cli.create("history", getPerpTradeHistoryAction.command);
export const getPerpTradeHistoryTool = getPerpTradeHistoryAction.tool;
