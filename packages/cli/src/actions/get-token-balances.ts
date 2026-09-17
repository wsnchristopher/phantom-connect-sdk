/**
 * get_token_balances tool - Returns fungible token balances for wallet addresses
 * using the Phantom portfolio API.
 */

import { Cli, z } from "incur";
import { createAction } from "../utils/actions";
import { ALL_NETWORKS, resolveNetworks, fetchPortfolioBalances } from "../utils/portfolio";

const GetTokenBalancesSchema = z.object({
  networks: z
    .array(z.enum(ALL_NETWORKS as [string, ...string[]]))
    .optional()
    .describe(
      "Networks to fetch balances for. Omit to fetch all supported networks. " +
        'Use a subset when the user asks about a specific chain — e.g. ["base"] for "what are my Base tokens?", ' +
        '["solana", "ethereum"] for "what are my Solana and Ethereum tokens?".',
    ),
});

const TokenBalanceSchema = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      symbol: z.string(),
      decimals: z.number(),
      caip19: z.string(),
      totalQuantity: z.number(),
      totalQuantityString: z.string(),
      spamStatus: z.string(),
      logoUri: z.string().optional(),
      price: z
        .object({
          price: z.number(),
          priceChange24h: z.number(),
        })
        .optional(),
      queriedWalletBalances: z.array(
        z.object({
          address: z.string(),
          quantity: z.number(),
          quantityString: z.string(),
        }),
      ),
    }),
  ),
});

const getTokenBalancesAction = createAction({
  description:
    "Phantom Wallet — Returns fungible token balances across all supported chains " +
    "(Solana, Ethereum, Base, Polygon, Arbitrum, Bitcoin, Sui) with live USD prices and 24h price change. " +
    "Use the `networks` parameter to filter by chain — omit it to fetch all chains at once. " +
    'Examples: pass ["base"] when user asks about Base tokens; ["solana"] for Solana only; omit for all. ' +
    "Use this to check if the user has enough funds before a transfer or swap. " +
    "This does not include Hyperliquid perpetuals account balances; if the user asks for Hyperliquid/perps funds or total exposure, also call get_perp_account. " +
    "Response: {items: [{name, symbol, decimals, caip19, totalQuantity, totalQuantityString, spamStatus, logoUri, " +
    "price?: {price, priceChange24h}, queriedWalletBalances: [{address, quantity, quantityString}]}]}. " +
    "Key fields: totalQuantity = human-readable balance (e.g. 1.5 for 1.5 SOL), " +
    "totalQuantityString = raw base units (e.g. '1500000000' lamports), " +
    "price.price = current USD price per token, " +
    "caip19 = token identifier (parse after '/token:' to get the Solana mint address; SOL is 'slip44:501'). " +
    "Non-spam tokens have spamStatus 'VERIFIED'. Filter out spamStatus 'SPAM' tokens for cleaner output.",
  options: GetTokenBalancesSchema,
  output: TokenBalanceSchema,
  mcp: {
    command: "get_token_balances",
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  run: async ({ options: params, var: context }) => {
    const requestedNetworks = resolveNetworks(params.networks);
    return fetchPortfolioBalances(context, requestedNetworks);
  },
});

export const walletBalancesCommand = Cli.create("balances", getTokenBalancesAction.command);
export const getTokenBalancesTool = getTokenBalancesAction.tool;
