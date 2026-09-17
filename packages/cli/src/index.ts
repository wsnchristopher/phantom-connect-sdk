import { createApiClient, createCli } from "./cli";
import { SessionManager } from "./session/manager";

const manager = new SessionManager();
const apiClient = createApiClient(manager, process.env["PHANTOM_API_BASE_URL"] ?? "https://api.phantom.app");

export const cli = createCli(manager, apiClient, { includeAuth: true });

export { loginTool } from "./actions/login";
export { logoutTool } from "./actions/logout";
export { createCli, createApiClient } from "./cli";
export { PluginConfigSchema, PluginConfigJsonSchema } from "./plugin-config";
export { SessionManager } from "./session/manager";
export { tools } from "./tools/index";
export { Logger } from "./utils/logger";

export type { DeviceCodeAuthDisplayOptions } from "./auth/types";
export type { PluginConfig } from "./plugin-config";
export type { ISessionManager, SessionData } from "./session/types";
export type { ToolContext } from "./tools/types";
