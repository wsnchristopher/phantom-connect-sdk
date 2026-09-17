/**
 * Phantom OpenClaw Plugin
 *
 * Integrates Phantom wallet operations directly with OpenClaw agents
 * by wrapping the Phantom MCP Server tools.
 */

import type { OpenClawApi } from "./client/types";
import { PluginSession } from "./session";
import { registerPhantomTools } from "./tools/register-tools";
import { PluginConfigSchema } from "@phantom/cli";

// Singleton session instance
let sessionInstance: PluginSession | null = null;
const PLUGIN_ID = "phantom-openclaw-plugin";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * OpenClaw passes the full openclaw.json object as api.config.
 * Extract this plugin's scoped config when available.
 */
function getPluginConfig(fullConfig?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!fullConfig) {
    return undefined;
  }

  const plugins = fullConfig.plugins;
  if (!isRecord(plugins)) {
    return fullConfig;
  }

  const entries = plugins.entries;
  if (!isRecord(entries)) {
    return fullConfig;
  }

  const pluginEntry = entries[PLUGIN_ID];
  if (!isRecord(pluginEntry)) {
    return fullConfig;
  }

  const pluginConfig = pluginEntry.config;
  if (isRecord(pluginConfig)) {
    return pluginConfig;
  }

  return fullConfig;
}

/**
 * Get or create the plugin session with configuration
 */
function getSession(callbackPort?: number): PluginSession {
  if (!sessionInstance) {
    sessionInstance = new PluginSession({
      callbackPort,
      authFlow: "device-code",
    });
  }
  return sessionInstance;
}

/**
 * Reset the session singleton (used for cleanup on initialization failure)
 */
function resetSession(): void {
  sessionInstance = null;
}

/**
 * Plugin registration function
 */
export default function register(api: OpenClawApi) {
  try {
    const rawConfig = getPluginConfig(api.config) ?? {};
    const config = PluginConfigSchema.parse(rawConfig);
    const session = getSession(config.PHANTOM_CALLBACK_PORT);
    registerPhantomTools(api, session, config);
  } catch (error) {
    console.error("Failed to initialize Phantom OpenClaw plugin:", error);
    // Reset singleton so next attempt gets a fresh instance
    resetSession();
    throw error;
  }
}
