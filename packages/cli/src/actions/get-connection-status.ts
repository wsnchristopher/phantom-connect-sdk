/**
 * get_connection_status tool - Returns current Phantom wallet connection status
 */

import { Cli, z } from "incur";
import { createAction } from "../utils/actions";
import * as packageJson from "../../package.json";

const ConnectionStatusSchema = z.discriminatedUnion("connected", [
  z.object({
    connected: z.literal(false),
    reason: z.string(),
    mcpServerVersion: z.string(),
  }),
  z.object({
    connected: z.literal(true),
    walletId: z.string(),
    organizationId: z.string(),
    mcpServerVersion: z.string(),
  }),
]);

const getConnectionStatusAction = createAction({
  description:
    "Phantom Wallet — Returns the current Phantom embedded wallet connection status. " +
    "Use this as a lightweight check before other operations to confirm the user is authenticated. " +
    "Unlike get_wallet_addresses, this does NOT make an API call and cannot trigger re-authentication; " +
    "it simply reports whether a local session exists. " +
    "Response when connected: {connected: true, walletId: string, organizationId: string, mcpServerVersion: string}. " +
    "Response when not connected: {connected: false, reason: string, mcpServerVersion: string}. " +
    "If connected is false, call get_wallet_addresses to trigger the Phantom Connect browser sign-in flow. " +
    "If connected is true but subsequent tool calls fail with AUTH_EXPIRED, the server-side session was revoked — " +
    "any tool call will automatically re-trigger authentication.",
  options: z.object({}),
  output: ConnectionStatusSchema,
  mcp: {
    command: "get_connection_status",
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  run: async ({ var: context }) => {
    const { logger } = context;

    logger.info("Checking connection status");

    if (!context.manager.isInitialized()) {
      return Promise.resolve({
        connected: false as const,
        reason: "No active session found. Call get_wallet_addresses to authenticate.",
        mcpServerVersion: packageJson.version,
      });
    }

    const session = context.manager.getSession();
    return Promise.resolve({
      connected: true as const,
      walletId: session.walletId,
      organizationId: session.organizationId,
      mcpServerVersion: packageJson.version,
    });
  },
});

export const walletStatusCommand = Cli.create("status", getConnectionStatusAction.command);
export const getConnectionStatusTool = getConnectionStatusAction.tool;
