/**
 * get_perp_orders tool
 *
 * Returns open perpetual orders for the authenticated wallet.
 */

import { PerpOrderSchema } from "@phantom/perps-client";
import { Cli, z } from "incur";
import { createAction } from "../utils/actions";
import { createPerpsClient } from "../utils/perps";
import { WalletIdSchema, DerivationIndexSchema } from "../utils/schemas";

const GetPerpOrdersSchema = z.object({
  walletId: WalletIdSchema.describe("Optional wallet ID (defaults to authenticated wallet)"),
  derivationIndex: DerivationIndexSchema.describe("Optional derivation index (default: 0)"),
});

const getPerpOrdersAction = createAction({
  description:
    "Returns all open perpetual orders (limit orders, take-profit, stop-loss) for the wallet. Each order includes ID, coin, side, type, limit/trigger price, size, and whether it is reduce-only.",
  options: GetPerpOrdersSchema,
  output: z.array(PerpOrderSchema),
  mcp: {
    command: "get_perp_orders",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  run: async ({ options: params, var: context }) => {
    const walletId = params.walletId ?? context.manager.getSession().walletId;

    const perps = await createPerpsClient(context, walletId, params.derivationIndex);
    return perps.getOpenOrders();
  },
});

export const perpsOrdersCommand = Cli.create("orders", getPerpOrdersAction.command);
export const getPerpOrdersTool = getPerpOrdersAction.tool;
