/**
 * sign_solana_message tool
 *
 * Signs a UTF-8 message with the authenticated Solana wallet.
 * Mirrors sdk.solana.signMessage(message) from the browser-sdk.
 */

import { Cli, z } from "incur";
import type { NetworkId } from "@phantom/client";
import { isSolanaChain } from "@phantom/utils";
import { createAction } from "../utils/actions";
import { normalizeNetworkId } from "../utils/network";
import { WalletIdSchema, DerivationIndexSchema, SolanaCaip2ChainIdSchema } from "../utils/schemas";
import { SignatureOutputSchema } from "../utils/output-schemas";

const SignSolanaMessageSchema = z.object({
  message: z.string().describe("The UTF-8 message to sign"),
  networkId: SolanaCaip2ChainIdSchema.describe('Solana network identifier (e.g., "solana:mainnet", "solana:devnet")'),
  derivationIndex: DerivationIndexSchema.describe("Optional derivation index for the account (default: 0)"),
  walletId: WalletIdSchema.describe("Optional wallet ID (defaults to authenticated wallet)"),
});

const signSolanaMessageAction = createAction({
  description:
    "Signs a UTF-8 message using the authenticated Solana embedded wallet. Returns a base58-encoded signature. Use this for off-chain signature proofs, authentication challenges, and message attestation on Solana.",
  options: SignSolanaMessageSchema,
  output: SignatureOutputSchema,
  mcp: {
    command: "sign_solana_message",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  run: async ({ options: params, var: context }) => {
    const { logger } = context;
    const client = context.manager.getClient();
    const session = context.manager.getSession();

    const networkId = normalizeNetworkId(params.networkId) as NetworkId;
    if (!isSolanaChain(networkId)) {
      throw new Error(
        "sign_solana_message supports Solana networks only. For EVM message signing use sign_evm_personal_message.",
      );
    }

    const walletId = params.walletId ?? session.walletId;

    logger.info(`Signing Solana message for wallet ${walletId} on ${networkId}`);

    try {
      const signature = await client.signUtf8Message({
        walletId,
        message: params.message,
        networkId,
        derivationIndex: params.derivationIndex,
      });

      logger.info(`Solana message signed successfully`);

      return { signature };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to sign Solana message: ${errorMessage}`);
      throw new Error(`Failed to sign Solana message: ${errorMessage}`);
    }
  },
});

export const signSolanaCommand = Cli.create("sign", signSolanaMessageAction.command);
export const signSolanaMessageTool = signSolanaMessageAction.tool;
