import { Cli, z } from "incur";
import { Logger } from "./utils/logger";
import { PhantomApiClient } from "@phantom/phantom-api-client";
import { ANALYTICS_HEADERS, NetworkId } from "@phantom/constants";
import { AddressType } from "@phantom/client";
import { base64urlEncode } from "@phantom/base64url";
import { loginCommand } from "./actions/login";
import { walletCli } from "./commands/wallet";
import { solanaCli } from "./commands/solana";
import { evmCli } from "./commands/evm";
import { transferCommand } from "./actions/transfer-tokens";
import { buyCommand } from "./actions/buy-token";
import { simulateCommand } from "./actions/simulate-transaction";
import { payCommand } from "./actions/pay-api-access";
import { perpsCli } from "./commands/perps";
import { tokenPriceCommand } from "./actions/get-token-price";
import * as packageJson from "../package.json";
import { varsSchema } from "./vars";
import type { BaseSessionData, ISessionManager } from "./session/types";
import { tools } from "./tools/index";
import { getWalletAddressesTool } from "./actions/get-wallet-addresses";
import { getConnectionStatusTool } from "./actions/get-connection-status";
import { logoutCommand } from "./actions/logout";

const COMMANDS = [
  walletCli,
  solanaCli,
  evmCli,
  transferCommand,
  buyCommand,
  simulateCommand,
  payCommand,
  perpsCli,
  tokenPriceCommand,
];

const MCP_INSTRUCTIONS = [
  "This is the Phantom Wallet MCP Server. Phantom is an enterprise-grade non-custodial crypto wallet supporting Solana, Ethereum, Bitcoin, Base, Polygon, Sui, and Monad. " +
    "Authentication uses Phantom Connect (OAuth with Google, Apple, or Phantom extension). Sessions persist across restarts. " +
    `Always call ${getWalletAddressesTool.name} or ${getConnectionStatusTool.name} first to confirm the user is authenticated. ` +
    "If an auth error occurs, re-authentication is triggered and the agent should retry after the user completes browser sign-in. ",
  "Available tools: " + tools.map(tool => tool.name).join(", "),
];

const STATIC_HEADERS: Record<string, string> = {
  [ANALYTICS_HEADERS.PLATFORM]: "ext-sdk",
  [ANALYTICS_HEADERS.CLIENT]: "mcp",
  [ANALYTICS_HEADERS.SDK_VERSION]: process.env["PHANTOM_VERSION"] ?? "0.0.1",
  // Signal to the backend that this client supports all order types (limit, TP, SL).
  // "0.0.0-dev" is treated as always-eligible by isClientVersionEligible().
  "x-phantom-version": "0.0.0-dev",
};

export function createCli<T extends BaseSessionData>(
  manager: ISessionManager<T>,
  apiClient: PhantomApiClient,
  { includeAuth = true }: { includeAuth: boolean },
): ReturnType<typeof Cli.create> {
  const logger = new Logger("cli");

  const instance = Cli.create("phantom", {
    version: packageJson.version,
    description: "Interact with your Phantom wallet from the terminal",
    vars: z.object({
      apiClient: varsSchema.shape.apiClient.default(apiClient),
      logger: varsSchema.shape.logger.default(logger),
      manager: varsSchema.shape.manager.default(manager),
    }),
    mcp: {
      instructions: MCP_INSTRUCTIONS.join("\n"),
    },
    sync: {
      suggestions: [
        "log in to my Phantom wallet",
        "show my wallet addresses",
        "check my token balances",
        "transfer tokens",
        "buy tokens",
        "open a perps position",
      ],
    },
  });

  instance.use(async (c, next) => {
    // Login manages auth via resetSession(), and logout clears state directly —
    // skip initialize() for both so middleware doesn't trigger unnecessary auth flow.
    if (![loginCommand.name, logoutCommand.name].includes(c.command) && !c.var.manager.isInitialized()) {
      await c.var.manager.initialize();
    }

    const sessionAppId = c.var.manager.isInitialized() ? c.var.manager.getSession().appId : undefined;
    const appId = process.env["PHANTOM_APP_ID"] ?? process.env["PHANTOM_CLIENT_ID"] ?? sessionAppId;

    // Important: we should not mutate the static headers to prevent cross-request pollution
    apiClient.setHeaders({
      ...STATIC_HEADERS,
      ...(appId && {
        [ANALYTICS_HEADERS.APP_ID]: appId,
        "x-api-key": appId,
      }),
    });

    await next();
  });

  if (includeAuth) {
    [loginCommand, logoutCommand].forEach(command => instance.command(command));
  }

  COMMANDS.forEach(command => instance.command(command));

  return instance;
}

export function createApiClient<T extends BaseSessionData>(
  manager: ISessionManager<T>,
  baseUrl: string,
): PhantomApiClient {
  const client = new PhantomApiClient({
    baseUrl,
  });

  client.setPaymentHandler(async payment => {
    const phantomClient = manager.getClient();
    const session = manager.getSession();

    const addresses = await phantomClient.getWalletAddresses(session.walletId);
    const account = addresses.find(address => address.addressType === AddressType.solana)?.address;
    if (!account) {
      throw new Error("No Solana address found for payment");
    }

    const txBytes = Buffer.from(payment.preparedTx, "base64");
    const result = await phantomClient.signAndSendTransaction({
      walletId: session.walletId,
      transaction: base64urlEncode(txBytes),
      networkId: NetworkId.SOLANA_MAINNET,
      account,
    });

    if (!result.hash) {
      throw new Error("Payment tx submitted but no signature returned");
    }
    return result.hash;
  });

  return client;
}
