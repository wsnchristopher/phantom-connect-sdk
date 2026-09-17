/**
 * simulate_transaction tool - Preview transaction effects using Phantom's simulation API.
 * Calls POST /simulation/v1 and returns expected
 * asset changes, security warnings, and blocking conditions without submitting on-chain.
 */

import { Cli, z } from "incur";
import { createAction } from "../utils/actions";
import { getSolanaAddress } from "../utils/solana";
import { getEthereumAddress } from "../utils/evm";
import { runSimulation, ScannedResultSchema } from "../utils/simulation";
import { WalletIdSchema, DerivationIndexSchema, Caip2ChainIdSchema } from "../utils/schemas";

const SimulateTransactionSchema = z.object({
  chainId: Caip2ChainIdSchema.describe(
    "CAIP-2 chain ID for the transaction. " +
      "Solana: 'solana:mainnet' | 'solana:devnet'. " +
      "EVM: 'eip155:1' (Ethereum), 'eip155:8453' (Base), 'eip155:137' (Polygon), 'eip155:42161' (Arbitrum), 'eip155:143' (Monad). " +
      "Sui: 'sui:mainnet'. Bitcoin: 'bip122:000000000019d6689c085ae165831e93'.",
  ),
  type: z.enum(["transaction", "message"]).describe("Whether this is a transaction or a message signing request."),
  params: z
    .record(z.string(), z.unknown())
    .describe("Chain-specific transaction parameters. Shape varies by chain — see tool description for details."),
  url: z
    .string()
    .optional()
    .describe("dApp origin URL where the transaction originates (e.g. 'https://jup.ag'). Optional."),
  context: z
    .enum(["swap", "bridge", "send", "gaslessSwap"])
    .optional()
    .describe("Optional transaction context hint for more accurate simulation."),
  userAccount: z
    .string()
    .optional()
    .describe(
      "Wallet address to simulate for. Auto-derived from the authenticated session for Solana and EVM chains. " +
        "Required for Sui and Bitcoin if not determinable from session.",
    ),
  language: z
    .string()
    .optional()
    .default("en")
    .describe("Response language code (e.g. 'en', 'es', 'ja'). Defaults to 'en'."),
  derivationIndex: DerivationIndexSchema.describe("HD wallet derivation index for address lookup (default: 0)."),
  walletId: WalletIdSchema.describe("Optional wallet ID (defaults to authenticated wallet)"),
});

const SimulateTransactionOutputSchema = ScannedResultSchema;

const simulateTransactionAction = createAction({
  description:
    "Phantom Wallet — Simulates a transaction and returns expected asset changes, security warnings, and blocking " +
    "conditions — without submitting it on-chain. Use this to preview what a transaction will do before signing " +
    "or sending. Supports Solana, EVM (Ethereum, Base, Polygon, Arbitrum, Monad), Sui, and Bitcoin. " +
    "Built on top of Phantom's transaction simulation service. " +
    "The `userAccount` wallet address is auto-derived from the authenticated session for Solana and EVM chains; " +
    "supply it explicitly for Sui and Bitcoin. " +
    "Chain-specific `params` shapes: " +
    "Solana transaction — { transactions: ['<base58>'], method?, simulatorConfig?: { decodeAccounts?, decodeInstructions? } }; " +
    "EVM transaction — { transactions: [{ from, to, value, data, chainId, type }] }; " +
    "Sui transaction — { rawTransaction: '<bytes>' }; " +
    "Bitcoin transaction — { transaction: '<raw>', userAddresses?: ['bc1q...'] }; " +
    "EVM message signing — { message: '0x...' }. " +
    "Response: { type, expectedChanges: [{ type, changeSign: PLUS|MINUS|EQUAL, changeText, asset: { type, amount, decimals, symbol, usdValue } }], " +
    "warnings: [{ message, severity: 1-5 }], block?: { message, severity }, advancedDetails?: { chainId, totalFee, feePayers, gas, contractAddresses } }.",
  options: SimulateTransactionSchema,
  output: SimulateTransactionOutputSchema,
  mcp: {
    command: "simulate_transaction",
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  run: async ({ options: params, var: context }) => {
    const { logger } = context;
    const session = context.manager.getSession();

    const chainId = params.chainId;
    const txType = params.type;
    const txParams = params.params;
    const language = params.language;
    const walletId = params.walletId ?? session.walletId;
    const derivationIndex = params.derivationIndex;

    // Auto-derive userAccount if not provided
    let userAccount = params.userAccount;

    if (!userAccount) {
      const normalizedChain = chainId.toLowerCase();
      if (normalizedChain.startsWith("solana:")) {
        userAccount = await getSolanaAddress(context, walletId, derivationIndex);
        logger.debug(`Auto-derived Solana userAccount: ${userAccount}`);
      } else if (normalizedChain.startsWith("eip155:")) {
        userAccount = await getEthereumAddress(context, walletId, derivationIndex);
        logger.debug(`Auto-derived EVM userAccount: ${userAccount}`);
      } else {
        // Sui and Bitcoin: attempt to look up by addressType; proceed without if not found
        const allAddresses = await context.manager.getClient().getWalletAddresses(walletId, undefined, derivationIndex);
        const addressTypePrefix = normalizedChain.startsWith("sui:") ? "sui" : "bitcoin";
        const match = allAddresses.find(a => a.addressType.toLowerCase() === addressTypePrefix);
        if (match) {
          userAccount = match.address;
          logger.debug(`Auto-derived ${addressTypePrefix} userAccount: ${userAccount}`);
        } else {
          logger.debug(`No ${addressTypePrefix} address found in wallet; proceeding without userAccount`);
        }
      }
    }

    // Build request body — omit undefined optional fields
    const body = {
      type: txType,
      chainId,
      params: txParams,
      ...(userAccount ? { userAccount } : {}),
      ...(params.url ? { url: params.url } : {}),
      ...(params.context ? { context: params.context } : {}),
    };

    logger.info(`Simulating ${txType} on ${chainId} (userAccount: ${userAccount ?? "not set"})`);

    const result = await runSimulation(body, context, language);

    logger.info("Simulation completed successfully");
    return result;
  },
});

const SimulateCliSchema = SimulateTransactionSchema.extend({
  params: z.preprocess(val => {
    if (typeof val !== "string") {
      return val;
    }
    try {
      return JSON.parse(val);
    } catch (e) {
      throw new Error(`Invalid JSON for --params: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, SimulateTransactionSchema.shape.params),
});

export const simulateCommand = Cli.create("simulate", {
  ...simulateTransactionAction.command,
  options: SimulateCliSchema,
});
export const simulateTransactionTool = simulateTransactionAction.tool;
