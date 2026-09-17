/**
 * sign_evm_typed_data tool
 *
 * Signs EIP-712 typed structured data with the authenticated EVM embedded wallet.
 * Mirrors sdk.ethereum.signTypedData(typedData, address) from the browser-sdk.
 *
 * This is the standard interface used by DeFi protocols for permit signatures,
 * order signing, and other off-chain approvals.
 */

import { Cli, z } from "incur";
import { isEthereumChain } from "@phantom/utils";
import { validateEip712TypedData } from "@phantom/parsers";
import { chainIdToNetworkId } from "@phantom/constants";
import { createAction } from "../utils/actions";
import { parseChainId } from "../utils/params";
import { WalletIdSchema, DerivationIndexSchema, EvmChainIdSchema } from "../utils/schemas";
import { SignatureOutputSchema } from "../utils/output-schemas";

const SignEvmTypedDataSchema = z.object({
  typedData: z
    .object({
      types: z
        .record(z.string(), z.unknown())
        .describe("Type definitions mapping type names to arrays of {name, type} fields"),
      primaryType: z.string().describe("The primary type name to sign (must be a key in types)"),
      domain: z
        .record(z.string(), z.unknown())
        .describe("EIP-712 domain separator values (e.g. name, version, chainId, verifyingContract)"),
      message: z.record(z.string(), z.unknown()).describe("The structured data to sign, conforming to primaryType"),
    })
    .describe(
      "EIP-712 typed data object. Must contain: types (object), primaryType (string), domain (object), message (object). See https://eips.ethereum.org/EIPS/eip-712 for the full specification.",
    ),
  chainId: EvmChainIdSchema.describe(
    "EVM chain ID (e.g. 1 for Ethereum mainnet, 8453 for Base, 137 for Polygon, 42161 for Arbitrum, 143 for Monad). Matches the chainId field from DeFi aggregators.",
  ),
  derivationIndex: DerivationIndexSchema.describe("Optional derivation index for the account (default: 0)"),
  walletId: WalletIdSchema.describe("Optional wallet ID (defaults to authenticated wallet)"),
});

const signEvmTypedDataAction = createAction({
  description:
    "Signs EIP-712 typed structured data using the authenticated EVM embedded wallet. Returns a hex-encoded signature. Used for DeFi permit signatures, order signing (e.g. 0x, Seaport), and other structured off-chain approvals. The typedData parameter must follow the EIP-712 structure with types, primaryType, domain, and message fields. Use the chainId number directly (e.g. 1 for Ethereum, 8453 for Base, 137 for Polygon, 42161 for Arbitrum, 143 for Monad).",
  options: SignEvmTypedDataSchema,
  output: SignatureOutputSchema,
  mcp: {
    command: "sign_evm_typed_data",
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

    // Validate typedData structure (throws with a descriptive error if invalid)
    validateEip712TypedData(params.typedData);
    const typedData = params.typedData;

    // Reject domain.chainId that contradicts the provided chainId
    const domainChainIdRaw = typedData.domain.chainId;
    if (domainChainIdRaw !== undefined) {
      const domainChainId =
        typeof domainChainIdRaw === "number"
          ? domainChainIdRaw
          : typeof domainChainIdRaw === "string"
            ? parseInt(domainChainIdRaw, 10)
            : NaN;
      if (isNaN(domainChainId) || domainChainId !== chainId) {
        throw new Error(
          `typedData.domain.chainId (${domainChainIdRaw}) does not match the provided chainId (${chainId}). ` +
            `Ensure typedData and chainId refer to the same chain.`,
        );
      }
    }

    const walletId = params.walletId ?? session.walletId;

    logger.info(`Signing EIP-712 typed data for wallet ${walletId} on ${networkId}`);

    try {
      const signature = await client.ethereumSignTypedData({
        walletId,
        typedData,
        networkId,
        derivationIndex: params.derivationIndex,
      });

      logger.info(`EIP-712 typed data signed successfully`);

      return { signature };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to sign EIP-712 typed data: ${errorMessage}`);
      throw new Error(`Failed to sign EIP-712 typed data: ${errorMessage}`);
    }
  },
});

const SignEvmTypedCliSchema = SignEvmTypedDataSchema.extend({
  typedData: z.preprocess(val => {
    if (typeof val !== "string") {
      return val;
    }
    try {
      return JSON.parse(val);
    } catch (e) {
      throw new Error(`Invalid JSON for --typed-data: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, SignEvmTypedDataSchema.shape.typedData),
});

export const signEvmTypedCommand = Cli.create("sign-typed", {
  ...signEvmTypedDataAction.command,
  options: SignEvmTypedCliSchema,
});
export const signEvmTypedDataTool = signEvmTypedDataAction.tool;
