/**
 * Types for Hyperliquid perpetuals trading via Phantom backend.
 */

/**
 * Minimal logger interface — satisfied by the MCP server Logger class
 * or any standard logger (console, pino, etc.).
 */
export interface PerpsLogger {
  info(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}

/** No-op logger used when no logger is provided */
export const noopLogger: PerpsLogger = {
  info: () => {},
  error: () => {},
  debug: () => {},
};
