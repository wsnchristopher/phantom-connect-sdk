/**
 * send_solana_transaction tool
 *
 * Accepts a standard base64-encoded serialized Solana transaction (the format
 * used by Solana JSON-RPC and returned by DeFi APIs), signs it using the
 * authenticated embedded wallet, and broadcasts it to the network.
 *
 * Mirrors sdk.solana.signAndSendTransaction(tx) from the browser-sdk.
 */

import { Cli, z } from "incur";
import type { NetworkId } from "@phantom/client";
import { WalletServiceError } from "@phantom/client";
import { isSolanaChain } from "@phantom/utils";
import { base64urlEncode } from "@phantom/base64url";
import bs58 from "bs58";
import { createAction } from "../utils/actions";
import { normalizeNetworkId, normalizeSwapperChainId } from "../utils/network";
import { getSolanaAddress } from "../utils/solana";
import { runSimulation } from "../utils/simulation";
import { WalletIdSchema, DerivationIndexSchema, SolanaCaip2ChainIdSchema, Base64Schema } from "../utils/schemas";
import { PendingConfirmationSchema } from "../utils/output-schemas";

const SendSolanaTransactionSchema = z.object({
  transaction: Base64Schema.describe(
    "The serialized Solana transaction encoded as standard base64 (the format used by Solana JSON-RPC and DeFi APIs). Do not base58-encode — use base64.",
  ),
  networkId: SolanaCaip2ChainIdSchema.default("solana:mainnet").describe(
    'Solana network identifier (e.g., "solana:mainnet", "solana:devnet"). Defaults to "solana:mainnet".',
  ),
  derivationIndex: DerivationIndexSchema.describe("Optional derivation index for the account (default: 0)"),
  confirmed: z
    .union([z.boolean(), z.stringbool()])
    .default(false)
    .describe(
      "Set to true only after the user has reviewed and approved the simulation results. Omit (or false) on the first call to get a simulation preview without submitting.",
    ),
  walletId: WalletIdSchema.describe("Optional wallet ID (defaults to authenticated wallet)"),
});

const SendSolanaTransactionOutputSchema = z.union([
  PendingConfirmationSchema,
  z.object({
    signature: z.string().nullable(),
    networkId: z.string(),
    account: z.string(),
  }),
]);

const sendSolanaTransactionAction = createAction({
  description:
    "Signs and broadcasts a Solana transaction using the authenticated embedded wallet. Accepts a standard base64-encoded serialized transaction (the format returned by Solana DeFi APIs such as Jupiter, Phantom swap, and others). " +
    "SAFETY: By default (no confirmed flag), this tool runs a simulation and returns expected asset changes and warnings WITHOUT sending anything — use this to show the user what will happen and ask for approval. " +
    "Pass confirmed: true only after the user explicitly approves the preview to actually sign and send. " +
    "If the user wants to skip simulation and execute immediately, pass confirmed: true directly — but the two-step flow is recommended for safety. " +
    "Response WITHOUT confirmed: {status: 'pending_confirmation', simulation: {expectedChanges, warnings, block?, advancedDetails?} | null}. " +
    "Response WITH confirmed: true: {signature, networkId, account}.",
  options: SendSolanaTransactionSchema,
  output: SendSolanaTransactionOutputSchema,
  mcp: {
    command: "send_solana_transaction",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    },
  },
  run: async ({ options: params, var: context }) => {
    const { logger } = context;
    const client = context.manager.getClient();
    const session = context.manager.getSession();

    const networkId = normalizeNetworkId(params.networkId) as NetworkId;
    if (!isSolanaChain(networkId)) {
      throw new Error("send_solana_transaction supports Solana networks only");
    }

    const walletId = params.walletId ?? session.walletId;
    const derivationIndex = params.derivationIndex;

    // Decode standard base64 → bytes → re-encode as base64url (what PhantomClient KMS expects)
    const txBytes = new Uint8Array(Buffer.from(params.transaction, "base64"));
    if (txBytes.length === 0) {
      throw new Error("transaction decoded to empty bytes");
    }

    const encoded = base64urlEncode(txBytes);
    const account = await getSolanaAddress(context, walletId, derivationIndex);
    const confirmed = params.confirmed === true;

    if (!confirmed) {
      logger.info("Running simulation before sending Solana transaction (confirmed not set)");
      const base58Tx = bs58.encode(txBytes);
      try {
        const simulation = await runSimulation(
          {
            type: "transaction",
            chainId: normalizeSwapperChainId(networkId),
            userAccount: account,
            params: { transactions: [base58Tx], method: "signAndSendTransaction" },
          },
          context,
        );
        logger.info("Simulation complete — awaiting user confirmation");
        return { status: "pending_confirmation" as const, simulation };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn(`Unable to simulate transaction at the moment: ${errorMessage}`);
        return { status: "pending_confirmation" as const, simulation: null };
      }
    }

    logger.info(`Sending Solana transaction for wallet ${walletId} on ${networkId}`);

    try {
      const result = await client.signAndSendTransaction({
        walletId,
        transaction: encoded,
        networkId,
        derivationIndex,
        account,
      });

      logger.info(`Solana transaction sent: ${result.hash ?? "no hash"}`);

      return {
        signature: result.hash ?? null,
        networkId,
        account,
      };
    } catch (error) {
      if (error instanceof WalletServiceError) {
        logger.error(
          `Solana transaction rejected by wallet service: type=${error.type} title="${error.title}" detail="${error.detail}" requestId=${error.requestId}`,
        );
        throw new Error(`Failed to send Solana transaction: ${error.detail || error.title || error.message}`);
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to send Solana transaction: ${errorMessage}`);
      logger.error(`Full error detail: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`);
      throw new Error(`Failed to send Solana transaction: ${errorMessage}`);
    }
  },
});

export const sendSolanaCommand = Cli.create("send", sendSolanaTransactionAction.command);
export const sendSolanaTransactionTool = sendSolanaTransactionAction.tool;
