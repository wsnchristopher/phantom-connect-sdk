/**
 * sign_evm_personal_message tool
 *
 * Signs a personal message using EIP-191 (eth_sign / personal_sign) with
 * the authenticated EVM embedded wallet.
 * Mirrors sdk.ethereum.signPersonalMessage(message, address) from the browser-sdk.
 */

import { Cli, z } from "incur";
import { isEthereumChain } from "@phantom/utils";
import { chainIdToNetworkId } from "@phantom/constants";
import { stringToBase64url } from "@phantom/base64url";
import { createAction } from "../utils/actions";
import { parseChainId } from "../utils/params";
import { WalletIdSchema, DerivationIndexSchema, EvmChainIdSchema } from "../utils/schemas";
import { SignatureOutputSchema } from "../utils/output-schemas";

const SignEvmPersonalMessageSchema = z.object({
  message: z.string().describe("The UTF-8 message to sign"),
  chainId: EvmChainIdSchema.describe(
    "EVM chain ID (e.g. 1 for Ethereum mainnet, 8453 for Base, 137 for Polygon, 42161 for Arbitrum, 143 for Monad). Matches the chainId field from DeFi aggregators.",
  ),
  derivationIndex: DerivationIndexSchema.describe("Optional derivation index for the account (default: 0)"),
  walletId: WalletIdSchema.describe("Optional wallet ID (defaults to authenticated wallet)"),
});

const signEvmPersonalMessageAction = createAction({
  description:
    "Signs a UTF-8 message using EIP-191 personal_sign with the authenticated EVM embedded wallet. " +
    "Use this for authentication challenges, proof-of-ownership flows, or any off-chain EVM signature request. " +
    "Returns a hex-encoded signature. Use the chainId number directly (e.g. 1 for Ethereum, 8453 for Base, 137 for Polygon, 42161 for Arbitrum, 143 for Monad). " +
    "For Solana message signing use sign_solana_message instead. " +
    "Success response: {signature: string}.",
  options: SignEvmPersonalMessageSchema,
  output: SignatureOutputSchema,
  mcp: {
    command: "sign_evm_personal_message",
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

    const chainId = parseChainId(params.chainId);
    const networkId = chainIdToNetworkId(chainId);
    if (!networkId || !isEthereumChain(networkId)) {
      throw new Error(
        `Unsupported chainId: ${chainId}. Use a supported EVM chain ID (e.g. 1 for Ethereum, 8453 for Base, 137 for Polygon, 42161 for Arbitrum, 143 for Monad).`,
      );
    }

    const walletId = params.walletId ?? session.walletId;

    // Convert UTF-8 message to base64url (what PhantomClient KMS expects for EIP-191)
    const base64Message = stringToBase64url(params.message);

    logger.info(`Signing EVM personal message for wallet ${walletId} on ${networkId}`);

    try {
      const signature = await client.ethereumSignMessage({
        walletId,
        message: base64Message,
        networkId,
        derivationIndex: params.derivationIndex,
      });

      logger.info(`EVM personal message signed successfully`);

      return { signature };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to sign EVM personal message: ${errorMessage}`);
      throw new Error(`Failed to sign EVM personal message: ${errorMessage}`);
    }
  },
});

export const signEvmCommand = Cli.create("sign", signEvmPersonalMessageAction.command);
export const signEvmPersonalMessageTool = signEvmPersonalMessageAction.tool;
