/**
 * get_perp_account tool
 *
 * Returns the perpetuals account balance for the authenticated wallet.
 */

import { PerpAccountBalanceSchema } from "@phantom/perps-client";
import { Cli, z } from "incur";
import { createAction } from "../utils/actions";
import { createPerpsClient } from "../utils/perps";
import { WalletIdSchema, DerivationIndexSchema } from "../utils/schemas";

const GetPerpAccountSchema = z.object({
  walletId: WalletIdSchema.describe("Optional wallet ID (defaults to authenticated wallet)"),
  derivationIndex: DerivationIndexSchema.describe("Optional derivation index (default: 0)"),
});

const getPerpAccountAction = createAction({
  description:
    "Returns the perpetuals account balance including total account value, available balance, and withdrawable amount. The account is on Hyperliquid (funded with USDC).",
  options: GetPerpAccountSchema,
  output: PerpAccountBalanceSchema,
  mcp: {
    command: "get_perp_account",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  run: async ({ options: params, var: context }) => {
    const walletId = params.walletId ?? context.manager.getSession().walletId;

    const perps = await createPerpsClient(context, walletId, params.derivationIndex);
    return perps.getBalance();
  },
});

export const perpsAccountCommand = Cli.create("account", getPerpAccountAction.command);
export const getPerpAccountTool = getPerpAccountAction.tool;
