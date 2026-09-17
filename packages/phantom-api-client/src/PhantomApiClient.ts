import { RateLimitError, PaymentRequiredError } from "./errors";
import type { X402Response, X429Response } from "./types";

export interface Logger {
  debug(msg: string): void;
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

/**
 * Called when the proxy returns 402. Receives the payment details and must return
 * the Solana transaction signature once the CASH transfer has been signed and broadcast.
 * After this resolves, the original request is automatically retried.
 */
export type PaymentHandler = (payment: {
  network: string;
  token: string;
  amount: string;
  preparedTx: string;
  description: string;
}) => Promise<string>;

export interface PhantomApiClientOptions {
  baseUrl: string;
  logger?: Logger;
  /**
   * Request timeout in milliseconds. Defaults to 30000 (30 seconds).
   */
  timeoutMs?: number;
  /**
   * Optional handler invoked on 402 Payment Required. When set, the client calls this,
   * stores the returned signature, and retries the original request automatically.
   * Can also be set/updated later via setPaymentHandler().
   */
  onPaymentRequired?: PaymentHandler;
}

export class PhantomApiClient {
  private readonly baseUrl: string;
  private readonly logger?: Logger;
  private readonly timeoutMs: number;
  private staticHeaders: Record<string, string> = {};
  private paymentSignature: string | null = null;
  private paymentHandler: PaymentHandler | null = null;
  private getDynamicHeadersFn: (() => Record<string, string | undefined>) | null = null;

  constructor(options: PhantomApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.logger = options.logger;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.paymentHandler = options.onPaymentRequired ?? null;
  }

  /**
   * Set or replace the payment handler. Useful for wiring in the signer after login
   * when the PhantomClient isn't available at construction time.
   */
  setPaymentHandler(handler: PaymentHandler): void {
    this.paymentHandler = handler;
  }

  /**
   * Set static headers merged into every request. Typically called once after
   * authentication to set X-Wallet-Address, x-api-key, X-App-Id, etc.
   */
  setHeaders(headers: Record<string, string>): void {
    this.staticHeaders = { ...this.staticHeaders, ...headers };
  }

  /**
   * Set a callback invoked on every request to supply dynamic headers (e.g. a
   * refreshable OAuth bearer token). Dynamic headers are merged after static
   * headers so they can override them. Undefined values are omitted.
   */
  setGetHeaders(fn: () => Record<string, string | undefined>): void {
    this.getDynamicHeadersFn = fn;
  }

  /** Stored after a successful payment — sent as X-Payment on all subsequent requests */
  setPaymentSignature(sig: string): void {
    this.paymentSignature = sig;
  }

  /** GET — on 402, auto-pays via handler and retries once */
  async get<T>(
    path: string,
    options?: { params?: Record<string, string>; headers?: Record<string, string> },
  ): Promise<T> {
    try {
      return await this._get<T>(path, options);
    } catch (err) {
      if (err instanceof PaymentRequiredError && this.paymentHandler) {
        await this._pay(err);
        return this._get<T>(path, options);
      }
      throw err;
    }
  }

  /** POST — on 402, auto-pays via handler and retries once */
  async post<T>(path: string, body: unknown, options?: { headers?: Record<string, string> }): Promise<T> {
    try {
      return await this._post<T>(path, body, options);
    } catch (err) {
      if (err instanceof PaymentRequiredError && this.paymentHandler) {
        await this._pay(err);
        return this._post<T>(path, body, options);
      }
      throw err;
    }
  }

  private async _get<T>(
    path: string,
    options?: { params?: Record<string, string>; headers?: Record<string, string> },
  ): Promise<T> {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${normalizedPath}`);
    if (options?.params) {
      for (const [k, v] of Object.entries(options.params)) {
        url.searchParams.set(k, v);
      }
    }
    this.logger?.info(`GET ${url.href}`);
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: this.buildHeaders(options?.headers),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    this.logger?.info(`GET ${url.href} → ${response.status}`);
    return this.handleResponse<T>(response, "GET", url.toString());
  }

  private async _post<T>(path: string, body: unknown, options?: { headers?: Record<string, string> }): Promise<T> {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = `${this.baseUrl}${normalizedPath}`;
    this.logger?.info(`POST ${url}`);
    const response = await fetch(url, {
      method: "POST",
      headers: this.buildHeaders(options?.headers),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    this.logger?.info(`POST ${url} → ${response.status}`);
    return this.handleResponse<T>(response, "POST", url);
  }

  private async _pay(err: PaymentRequiredError): Promise<void> {
    this.logger?.info(`402 Payment Required — invoking payment handler (${err.payment.amount} ${err.payment.token})`);
    const sig = await this.paymentHandler!(err.payment);
    this.logger?.info(`Payment complete — sig ${sig.slice(0, 12)}… stored, retrying request`);
    this.setPaymentSignature(sig);
  }

  private buildHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...this.staticHeaders,
    };
    if (this.getDynamicHeadersFn) {
      for (const [k, v] of Object.entries(this.getDynamicHeadersFn())) {
        if (v !== undefined) headers[k] = v;
      }
    }
    if (extra) {
      Object.assign(headers, extra);
    }
    if (this.paymentSignature) {
      headers["X-Payment"] = this.paymentSignature;
    }
    return headers;
  }

  private async handleResponse<T>(response: Response, method: string, url: string): Promise<T> {
    if (response.status === 429) {
      let body: Partial<X429Response> = {};
      try {
        body = (await response.json()) as X429Response;
      } catch {
        // ignore parse errors
      }
      throw new RateLimitError(body.retryAfterMs ?? 1000);
    }

    if (response.status === 402) {
      let body: Partial<X402Response> = {};
      try {
        body = (await response.json()) as X402Response;
      } catch {
        // ignore parse errors
      }
      if (body.payment) {
        throw new PaymentRequiredError(body.limitType ?? "daily", body.payment);
      }
      throw new PaymentRequiredError("daily", {
        network: "solana",
        token: "CASH",
        amount: "0.01",
        preparedTx: "",
        description: "Payment required to access this API",
      });
    }

    if (!response.ok) {
      let bodyText = "";
      try {
        bodyText = await response.text();
      } catch {
        // ignore
      }
      const message = `Phantom API ${method} ${url} failed: HTTP ${response.status} — ${bodyText}`;
      this.logger?.error(message);
      throw new Error(message);
    }

    return response.json() as Promise<T>;
  }
}
