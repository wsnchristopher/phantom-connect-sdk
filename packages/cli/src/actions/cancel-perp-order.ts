/**
 * cancel_perp_order tool
 *
 * Cancels an open perpetual order on Hyperliquid.
 */

import { ActionResponseSchema } from "@phantom/perps-client";
import { Cli, z } from "incur";
import { createAction } from "../utils/actions";
import { createPerpsClient } from "../utils/perps";
import { WalletIdSchema, DerivationIndexSchema } from "../utils/schemas";

const CancelPerpOrderSchema = z.object({
  market: z
    .string()
    .trim()
    .min(1, { message: "market is required" })
    .describe(
      'Market symbol (e.g. "BTC"). For HIP-3 builder-deployed markets use "DEX:SYMBOL" format (e.g. "WOOF:BTC").',
    ),
  orderId: z.coerce
    .number()
    .int()
    .refine(n => Number.isSafeInteger(n), {
      message: "orderId must be a safe integer",
    })
    .describe("The numeric order ID to cancel (from get_perp_orders)"),
  walletId: WalletIdSchema.describe("Optional wallet ID (defaults to authenticated wallet)"),
  derivationIndex: DerivationIndexSchema.describe("Optional derivation index (default: 0)"),
});

const cancelPerpOrderAction = createAction({
  description:
    "Cancels an open perpetual order on Hyperliquid. Use get_perp_orders to retrieve the order ID before cancelling.",
  options: CancelPerpOrderSchema,
  output: ActionResponseSchema,
  mcp: {
    command: "cancel_perp_order",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    },
  },
  run: async ({ options: params, var: context }) => {
    const walletId = params.walletId ?? context.manager.getSession().walletId;
    const perps = await createPerpsClient(context, walletId, params.derivationIndex);

    context.logger.info(`Cancelling perp order ${params.orderId} on ${params.market}`);

    return perps.cancelOrder({
      market: params.market,
      orderId: params.orderId,
    });
  },
});

export const perpsCancelCommand = Cli.create("cancel", cancelPerpOrderAction.command);
export const cancelPerpOrderTool = cancelPerpOrderAction.tool;
