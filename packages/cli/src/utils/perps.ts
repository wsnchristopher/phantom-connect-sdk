/**
 * Factory helper for creating a PerpsClient from MCP tool context.
 *
 * Adapts PhantomClient into the PerpsClient's simpler (evmAddress, signTypedData) interface
 * and wires in the tool's logger so all API calls appear in the MCP debug log.
 */

import type { NetworkId } from "@phantom/client";
import { PerpsClient } from "@phantom/perps-client";
import { getEthereumAddress } from "./evm";
import type { ToolContext } from "../tools/types";

/** Arbitrum — the default chain ID used for Hyperliquid EIP-712 signing */
const ARBITRUM_NETWORK_ID = "eip155:42161" as NetworkId;

/**
 * Creates a read-only PerpsClient that requires no authenticated wallet.
 * Suitable for wallet-agnostic calls such as fetching market listings.
 */
export function createAnonymousPerpsClient(context: ToolContext): PerpsClient {
  const logger = context.logger.child("perps");
  return new PerpsClient({
    evmAddress: "0x0000000000000000000000000000000000000000",
    signTypedData: () => Promise.reject(new Error("Not authenticated")),
    logger,
    apiClient: context.apiClient,
  });
}

export async function createPerpsClient(
  context: ToolContext,
  walletId: string,
  derivationIndex?: number,
): Promise<PerpsClient> {
  const evmAddress = await getEthereumAddress(context, walletId, derivationIndex);

  // Child logger so perps API calls show up as [PhantomMCPServer:perps] in the log file
  const logger = context.logger.child("perps");

  return new PerpsClient({
    evmAddress,
    signTypedData: typedData =>
      context.manager.getClient().ethereumSignTypedData({
        walletId,
        typedData,
        networkId: ARBITRUM_NETWORK_ID,
        derivationIndex,
      }),
    logger,
    apiClient: context.apiClient,
  });
}
