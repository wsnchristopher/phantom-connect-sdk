/**
 * MCP Tool types and interfaces
 */

import type { PhantomApiClient } from "@phantom/phantom-api-client";
import type { Logger } from "../utils/logger";
import type { BaseSessionData, ISessionManager } from "../session/types";

/**
 * Context provided to tool handlers
 */
export interface ToolContext<T extends BaseSessionData = BaseSessionData> {
  /** Logger instance for this tool */
  logger: Logger;
  /** Shared HTTP client for api.phantom.app (or proxy). Handles 402/429 automatically. */
  apiClient: PhantomApiClient;
  /** Session manager — use manager.getSession() and manager.getClient() to access session and wallet client. */
  manager: ISessionManager<T>;
}

/**
 * JSON Schema for MCP tool input validation (used at runtime by the MCP protocol layer).
 * Tool authors supply a Zod schema to createAction; this type is the converted output.
 */
export interface ToolInputSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
}

/**
 * MCP Tool annotations describing safety and behavior characteristics.
 * See: https://modelcontextprotocol.io/docs/concepts/tools#tool-annotations
 */
export interface ToolAnnotations {
  /** If true, the tool only reads data and has no side effects */
  readOnlyHint?: boolean;
  /** If true, the tool may perform destructive or irreversible actions (e.g. sending transactions) */
  destructiveHint?: boolean;
  /** If true, calling the tool repeatedly with the same inputs has the same effect as calling it once */
  idempotentHint?: boolean;
  /** If true, the tool may interact with external systems outside the local environment */
  openWorldHint?: boolean;
}

/**
 * MCP Tool definition. The optional `TResult` type parameter captures the exact return type
 * of the handler — use `ToolHandler` (defaults to `unknown`) when the concrete return type
 * is not needed (e.g. in `ToolHandler[]` collections).
 */
export interface ToolHandler<TResult = unknown, T extends BaseSessionData = BaseSessionData> {
  /** Tool name (used in tool calls) */
  name: string;
  /** Tool description (shown to LLM) */
  description: string;
  /** JSON schema for input validation */
  inputSchema: ToolInputSchema;
  /** Safety and behavior annotations */
  annotations?: ToolAnnotations;
  /** Tool handler function */
  handler: (params: Record<string, unknown>, context: ToolContext<T>) => Promise<TResult>;
}
