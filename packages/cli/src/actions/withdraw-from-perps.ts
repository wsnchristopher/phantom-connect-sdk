/**
 * withdraw_from_perps tool
 *
 * Bridges USDC from the Hyperliquid perpetuals account to an external chain via the Relay bridge.
 */

import { WithdrawFromSpotResultSchema } from "@phantom/perps-client";
import { isSolanaChain } from "@phantom/utils";
import { Cli, z } from "incur";
import { createAction } from "../utils/actions";
import {
  WalletIdSchema,
  DerivationIndexSchema,
  PositiveNumericStringSchema,
  Caip2ChainIdSchema,
  Caip19Schema,
} from "../utils/schemas";
import { createPerpsClient } from "../utils/perps";
import { getSolanaAddress } from "../utils/solana";
import { getEthereumAddress } from "../utils/evm";
import { normalizeSwapperChainId } from "../utils/network";

const WithdrawFromPerpsSchema = z.object({
  amountUsdc: PositiveNumericStringSchema.describe('Amount of USDC to withdraw (e.g. "50" for 50 USDC)'),
  destinationChainId: Caip2ChainIdSchema.describe(
    'Destination chain CAIP-2 ID. Examples: "solana:mainnet", "eip155:8453" (Base), ' +
      '"eip155:1" (Ethereum), "eip155:42161" (Arbitrum), "eip155:137" (Polygon).',
  ),
  buyToken: Caip19Schema.optional().describe(
    'CAIP-19 token to receive on the destination chain (e.g. "solana:101/token:EPjFWdd5..."). ' +
      "Defaults to USDC on the destination chain if omitted.",
  ),
  walletId: WalletIdSchema.describe("Optional wallet ID (defaults to authenticated wallet)"),
  derivationIndex: DerivationIndexSchema.describe("Optional derivation index (default: 0)"),
});

const withdrawFromPerpsAction = createAction({
  description:
    "Bridges USDC from the Hyperliquid perpetuals account to an external chain (Solana, Base, Ethereum, Arbitrum, Polygon) " +
    "via the Relay bridge. " +
    "By default receives USDC on the destination chain; pass buyToken to receive a different asset. " +
    "Use get_perp_account to check the available balance before withdrawing.",
  options: WithdrawFromPerpsSchema,
  output: WithdrawFromSpotResultSchema,
  mcp: {
    command: "withdraw_from_perps",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    },
  },
  run: async ({ options: params, var: context }) => {
    const walletId = params.walletId ?? context.manager.getSession().walletId;
    const derivationIndex = params.derivationIndex;
    const normalizedDest = normalizeSwapperChainId(params.destinationChainId);
    const isSolana = isSolanaChain(normalizedDest);

    const destinationAddress = isSolana
      ? await getSolanaAddress(context, walletId, derivationIndex)
      : await getEthereumAddress(context, walletId, derivationIndex);

    const perps = await createPerpsClient(context, walletId, derivationIndex);

    context.logger.info(`Withdrawing ${params.amountUsdc} USDC from perps to ${params.destinationChainId}`);

    return perps.withdrawFromSpot({
      amountUsdc: params.amountUsdc,
      destinationChainId: normalizedDest,
      destinationAddress,
      buyToken: params.buyToken,
    });
  },
});

export const perpsWithdrawCommand = Cli.create("withdraw", withdrawFromPerpsAction.command);
export const withdrawFromPerpsTool = withdrawFromPerpsAction.tool;
