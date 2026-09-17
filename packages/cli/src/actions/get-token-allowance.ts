/**
 * get_token_allowance tool
 *
 * Returns the ERC-20 allowance granted by an owner to a spender on any supported EVM chain.
 * Useful before a swap to check whether an approval transaction is needed.
 */

import { Cli, z } from "incur";
import { isEthereumChain } from "@phantom/utils";
import { chainIdToNetworkId } from "@phantom/constants";
import { createAction } from "../utils/actions";
import { getEthereumAddress } from "../utils/evm";
import { fetchERC20Allowance } from "../utils/allowance";
import { resolveEvmRpcUrl } from "../utils/rpc";
import { parseChainId } from "../utils/params";
import { WalletIdSchema, DerivationIndexSchema, EvmChainIdSchema, EthereumAddressSchema } from "../utils/schemas";

const GetTokenAllowanceSchema = z.object({
  chainId: EvmChainIdSchema.describe(
    'EVM chain ID (e.g. 8453 for Base, 1 for Ethereum, 137 for Polygon). Accepts a number, decimal string, or hex string (e.g. "0x2105").',
  ),
  tokenAddress: EthereumAddressSchema.describe("ERC-20 token contract address (0x-prefixed, checksummed)."),
  spenderAddress: EthereumAddressSchema.describe("Address of the spender to check allowance for (e.g. a swap router)."),
  ownerAddress: EthereumAddressSchema.optional().describe(
    "Address of the token owner. If omitted, the authenticated wallet address for the chain is used.",
  ),
  derivationIndex: DerivationIndexSchema.describe(
    "Optional derivation index for the wallet address (default: 0). Only used when ownerAddress is omitted.",
  ),
  walletId: WalletIdSchema.describe("Optional wallet ID (defaults to authenticated wallet)"),
});

const TokenAllowanceSchema = z.object({
  chainId: z.number(),
  tokenAddress: z.string(),
  ownerAddress: z.string(),
  spenderAddress: z.string(),
  allowance: z.string(),
  allowanceHex: z.string(),
});

const getTokenAllowanceAction = createAction({
  description:
    "Returns the ERC-20 token allowance granted by an owner address to a spender address on a supported EVM chain. " +
    "Use this before a swap to check whether an approval transaction is needed. " +
    "If ownerAddress is omitted, the authenticated wallet address for the chain is used.",
  options: GetTokenAllowanceSchema,
  output: TokenAllowanceSchema,
  mcp: {
    command: "get_token_allowance",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  run: async ({ options: params, var: context }) => {
    const { logger } = context;
    const session = context.manager.getSession();

    const chainId = parseChainId(params.chainId);
    const networkId = chainIdToNetworkId(chainId);
    if (!networkId || !isEthereumChain(networkId)) {
      throw new Error(
        `Unsupported chainId: ${chainId}. Use a supported EVM chain ID (e.g. 1 for Ethereum, 8453 for Base, 137 for Polygon).`,
      );
    }

    // EthereumAddressSchema already validates and checksums these at parse time
    const tokenAddress = params.tokenAddress;
    const spenderAddress = params.spenderAddress;
    const rpcUrl = resolveEvmRpcUrl(networkId);

    // Resolve owner: explicit address or derive from wallet
    let ownerAddress: string;
    if (params.ownerAddress !== undefined) {
      ownerAddress = params.ownerAddress;
    } else {
      const walletId = params.walletId ?? session.walletId;
      ownerAddress = await getEthereumAddress(context, walletId, params.derivationIndex);
    }

    logger.info(`Checking ERC-20 allowance: token=${tokenAddress} owner=${ownerAddress} spender=${spenderAddress}`);

    const allowance = await fetchERC20Allowance(rpcUrl, tokenAddress, ownerAddress, spenderAddress);
    const allowanceDecimal = allowance.toString();
    const allowanceHex = "0x" + allowance.toString(16);

    return {
      chainId,
      tokenAddress,
      ownerAddress,
      spenderAddress,
      allowance: allowanceDecimal,
      allowanceHex,
    };
  },
});

export const allowanceEvmCommand = Cli.create("allowance", getTokenAllowanceAction.command);
export const getTokenAllowanceTool = getTokenAllowanceAction.tool;
