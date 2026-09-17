/**
 * get_token_price tool
 *
 * Fetches the current price for a specific token by its address and chain,
 * using the Phantom portfolio API with a fungibleAddresses filter.
 */

import { Cli, z } from "incur";
import { createAction } from "../utils/actions";
import { ALL_NETWORKS, fetchPortfolioBalance, NETWORK_CONFIGS } from "../utils/portfolio";
import { NATIVE_TOKEN_CAIP19 } from "../utils/tokens";

const GetTokenPriceSchema = z.object({
  address: z
    .string()
    .describe(
      "Token contract or mint address. Pass 'native' to get the chain's native token price " +
        "(e.g. SOL, ETH, MATIC). For SPL tokens use the Solana mint address; for EVM tokens use the contract address.",
    ),
  chain: z
    .enum(ALL_NETWORKS as [string, ...string[]])
    .describe("Chain the token lives on. One of: solana, ethereum, base, polygon, arbitrum, bitcoin, sui, monad."),
  currency: z
    .string()
    .optional()
    .default("USD")
    .transform(val => val.toUpperCase())
    .describe("ISO 4217 currency code for the returned price. (Default: USD)"),
});

const GetTokenPriceOutputSchema = z.object({
  name: z.string(),
  symbol: z.string(),
  caip19: z.string(),
  price: z.number().nullable(),
  priceChange24h: z.number().nullable(),
  currency: z.string(),
  lastUpdatedAt: z.string().optional(),
  marketCap: z.number().nullable(),
});

const getTokenPriceAction = createAction({
  description:
    "Phantom Wallet — Fetches the current price of a specific token by its address and chain. " +
    "Pass address='native' for the chain's native token (SOL, ETH, MATIC, etc.). " +
    "For any other token, pass its mint address (Solana) or contract address (EVM). " +
    "Returns price in USD (or the requested currency if supported) with 24h change and market cap. " +
    "Response: {name, symbol, caip19, price, priceChange24h, currency, lastUpdatedAt?, marketCap}.",
  options: GetTokenPriceSchema,
  output: GetTokenPriceOutputSchema,
  mcp: {
    command: "get_token_price",
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  run: async ({ options: params, var: context }) => {
    const { logger, apiClient } = context;
    const client = context.manager.getClient();
    const session = context.manager.getSession();

    const chainConfig = NETWORK_CONFIGS[params.chain];
    if (!chainConfig) {
      throw new Error(`Unsupported chain. chain=${params.chain}`);
    }

    // Build CAIP-19 for the requested token
    let fungibleCaip19: string;
    if (params.address.toLowerCase() === "native") {
      const nativeToken = NATIVE_TOKEN_CAIP19[params.chain];
      if (!nativeToken) {
        throw new Error(`Native token not known for chain. chain=${params.chain}`);
      }
      fungibleCaip19 = nativeToken;
    } else {
      fungibleCaip19 = `${chainConfig.caip19Prefix}/address:${params.address}`;
    }

    const addresses = await client.getWalletAddresses(session.walletId);
    const wallet = addresses.find(a => a.addressType.toLowerCase() === chainConfig.addressType.toLowerCase());
    if (!wallet) {
      throw new Error(`No wallet address found for chain. chain=${params.chain}`);
    }

    const walletCaip19 = `${chainConfig.caip19Prefix}/address:${wallet.address}`;

    logger.info(`Fetching price for ${fungibleCaip19}`);

    const result = await fetchPortfolioBalance(apiClient, {
      walletAddresses: [walletCaip19],
      fungibleAddresses: [fungibleCaip19],
      includePrices: "true",
      currency: params.currency,
    });

    const item = result.items?.[0];
    if (!item) {
      throw new Error(`Token not found or price unavailable. caip19=${fungibleCaip19}`);
    }

    return {
      name: item.name,
      symbol: item.symbol,
      caip19: item.caip19,
      price: item.price?.price ?? null,
      priceChange24h: item.price?.priceChange24h ?? null,
      currency: params.currency,
      lastUpdatedAt: item.price?.lastUpdatedAt,
      marketCap: item.price?.marketCap ?? null,
    };
  },
});

export const tokenPriceCommand = Cli.create("price", getTokenPriceAction.command);
export const getTokenPriceTool = getTokenPriceAction.tool;
