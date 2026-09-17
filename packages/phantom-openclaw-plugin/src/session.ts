/**
 * Session management for Phantom OpenClaw plugin
 * Wraps the SessionManager from @phantom/cli
 */

import { SessionManager } from "@phantom/cli";
import type { PhantomClient } from "@phantom/client";
import type { SessionData, DeviceCodeAuthDisplayOptions } from "@phantom/cli";

/**
 * Configuration options for PluginSession
 */
export interface PluginSessionOptions {
  /** OAuth callback port (default: 8080) */
  callbackPort?: number;
  /** Authentication flow for the embedded wallet session */
  authFlow?: "sso" | "device-code";
  /** Directory to store session data (default: ~/.phantom-mcp) */
  sessionDir?: string;
}

/**
 * Plugin session manager
 * Handles authentication and provides access to PhantomClient
 */
export class PluginSession {
  private sessionManager: SessionManager;
  private initialized = false;
  private initializingPromise: Promise<void> | null = null;
  private pendingPrompt: string | null = null;

  constructor(options: PluginSessionOptions = {}) {
    // Initialize SessionManager with configuration
    this.sessionManager = new SessionManager({
      appId: "phantom-openclaw",
      callbackPort: options.callbackPort,
      authFlow: options.authFlow,
      sessionDir: options.sessionDir,
    });
  }

  /**
   * Initialize the session (authenticate if needed)
   * Thread-safe: concurrent calls will await the same initialization promise
   */
  async initialize(displayOptions?: DeviceCodeAuthDisplayOptions): Promise<void> {
    if (this.initialized) {
      return;
    }

    // If already initializing, return the existing promise
    if (this.initializingPromise) {
      return this.initializingPromise;
    }

    // Create and store the initialization promise.
    // The stale-promise guard (this.initializingPromise === initPromise) prevents a
    // concurrent logout() from being overwritten by a .then() that resolves after logout clears
    // this.initializingPromise.
    const initPromise = this.sessionManager
      .initialize(displayOptions)
      .then(() => {
        if (this.initializingPromise === initPromise) {
          this.initialized = true;
          this.pendingPrompt = null;
        }
      })
      .finally(() => {
        if (this.initializingPromise === initPromise) {
          this.initializingPromise = null;
        }
      });
    this.initializingPromise = initPromise;

    return initPromise;
  }

  async startTextModeAuthentication(): Promise<{ status: "ready" } | { status: "pending"; prompt: string }> {
    if (this.initialized) {
      return { status: "ready" };
    }

    if (this.initializingPromise) {
      return {
        status: "pending",
        prompt: this.pendingPrompt ?? "Authentication is already in progress. Complete the pending Phantom login flow.",
      };
    }

    let resolvePrompt!: (prompt: string) => void;
    const promptPromise = new Promise<string>(resolve => {
      resolvePrompt = resolve;
    });

    const initPromise = this.initialize({
      openBrowser: false,
      onPrompt: prompt => {
        this.pendingPrompt = prompt;
        resolvePrompt(prompt);
      },
    });

    void initPromise.catch(() => {});

    const raceResult = await Promise.race([
      initPromise.then(() => ({ status: "ready" as const })),
      promptPromise.then(prompt => ({ status: "pending" as const, prompt })),
    ]);

    return raceResult;
  }

  async resetSession(displayOptions?: DeviceCodeAuthDisplayOptions): Promise<void> {
    this.initializingPromise = null;
    this.initialized = false;
    this.pendingPrompt = null;
    await this.sessionManager.resetSession(displayOptions);
    this.initialized = true;
  }

  async logout(): Promise<void> {
    // Await any in-flight initialization before clearing so that a concurrent
    // sessionManager.initialize() cannot write session data to disk after
    // sessionManager.logout() has already deleted it.
    if (this.initializingPromise) {
      try {
        await this.initializingPromise;
      } catch {
        /* ignore auth errors */
      }
    }
    this.initializingPromise = null;
    this.initialized = false;
    this.pendingPrompt = null;
    await this.sessionManager.logout();
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the authenticated PhantomClient
   */
  getClient(): PhantomClient {
    if (!this.initialized) {
      throw new Error("Session not initialized. Call initialize() first.");
    }
    return this.sessionManager.getClient();
  }

  /**
   * Get the current session data
   */
  getSession(): SessionData {
    if (!this.initialized) {
      throw new Error("Session not initialized. Call initialize() first.");
    }
    return this.sessionManager.getSession();
  }

  /**
   * Get dynamic OAuth headers for authenticated Phantom API requests.
   */
  getOAuthHeaders(): Record<string, string | undefined> {
    if (!this.initialized) {
      throw new Error("Session not initialized. Call initialize() first.");
    }
    return this.sessionManager.getOAuthHeaders();
  }
}
