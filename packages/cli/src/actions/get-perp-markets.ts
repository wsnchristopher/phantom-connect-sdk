/**
 * get_perp_markets tool
 *
 * Returns all available perpetual markets on Hyperliquid with current prices,
 * funding rates, and market metadata.
 */

import { PerpMarketSchema } from "@phantom/perps-client";
import { Cli, z } from "incur";
import { createAction } from "../utils/actions";
import { createPerpsClient, createAnonymousPerpsClient } from "../utils/perps";
import { WalletIdSchema } from "../utils/schemas";

const GetPerpMarketsSchema = z.object({
  walletId: WalletIdSchema.describe("Optional wallet ID (defaults to authenticated wallet)"),
});

const getPerpMarketsAction = createAction({
  description:
    "Returns all available perpetual markets on Hyperliquid with current prices, funding rates, open interest, 24h volume, max leverage, and asset IDs. Use this to discover tradeable markets and get current prices before opening positions.",
  options: GetPerpMarketsSchema,
  output: z.array(PerpMarketSchema),
  mcp: {
    command: "get_perp_markets",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  run: async ({ options: params, var: context }) => {
    const walletId = params.walletId ?? context.manager.getSession().walletId;
    const perps = walletId ? await createPerpsClient(context, walletId) : createAnonymousPerpsClient(context);
    return perps.getMarkets();
  },
});

export const perpsMarketsCommand = Cli.create("markets", getPerpMarketsAction.command);
export const getPerpMarketsTool = getPerpMarketsAction.tool;
