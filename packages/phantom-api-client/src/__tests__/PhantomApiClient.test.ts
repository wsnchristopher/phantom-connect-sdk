import { PhantomApiClient } from "../PhantomApiClient";
import { RateLimitError, PaymentRequiredError } from "../errors";

function mockFetch(status: number, body: unknown): jest.SpyInstance {
  return jest.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);
}

describe("PhantomApiClient", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const client = new PhantomApiClient({ baseUrl: "https://api.phantom.app" });

  describe("get()", () => {
    it("returns parsed JSON on 200", async () => {
      mockFetch(200, { result: "ok" });
      const result = await client.get<{ result: string }>("/swap/v2/test");
      expect(result).toEqual({ result: "ok" });
    });

    it("appends query params to URL", async () => {
      const spy = mockFetch(200, {});
      await client.get("/path", { params: { foo: "bar", baz: "qux" } });
      const calledUrl = (spy.mock.calls[0] as unknown[])[0] as string;
      expect(calledUrl).toContain("foo=bar");
      expect(calledUrl).toContain("baz=qux");
    });

    it("sends X-Wallet-Address header when set via setHeaders", async () => {
      const headersClient = new PhantomApiClient({ baseUrl: "https://api.phantom.app" });
      headersClient.setHeaders({ "X-Wallet-Address": "solana-address-123" });
      const spy = mockFetch(200, {});
      await headersClient.get("/path");
      const calledHeaders = ((spy.mock.calls[0] as unknown[])[1] as RequestInit).headers as Record<string, string>;
      expect(calledHeaders["X-Wallet-Address"]).toBe("solana-address-123");
    });

    it("throws RateLimitError on 429", async () => {
      mockFetch(429, { error: "rate_limit", retryAfterMs: 500 });
      await expect(client.get("/path")).rejects.toBeInstanceOf(RateLimitError);
    });

    it("RateLimitError.retryAfterMs is populated from response", async () => {
      mockFetch(429, { error: "rate_limit", retryAfterMs: 2000 });
      try {
        await client.get("/path");
      } catch (err) {
        expect(err).toBeInstanceOf(RateLimitError);
        expect((err as RateLimitError).retryAfterMs).toBe(2000);
      }
    });

    it("throws PaymentRequiredError on 402", async () => {
      mockFetch(402, {
        error: "daily_limit_exceeded",
        limitType: "daily",
        payment: {
          network: "solana",
          token: "CASH",
          amount: "0.01",
          preparedTx: "base64tx==",
          description: "Pay 0.01 CASH to unlock today's API access",
        },
      });
      await expect(client.get("/path")).rejects.toBeInstanceOf(PaymentRequiredError);
    });

    it("PaymentRequiredError.payment is populated from response", async () => {
      mockFetch(402, {
        error: "daily_limit_exceeded",
        limitType: "daily",
        payment: {
          network: "solana",
          token: "CASH",
          amount: "0.01",
          preparedTx: "abc123==",
          description: "Pay 0.01 CASH",
        },
      });
      try {
        await client.get("/path");
      } catch (err) {
        expect(err).toBeInstanceOf(PaymentRequiredError);
        const payErr = err as PaymentRequiredError;
        expect(payErr.limitType).toBe("daily");
        expect(payErr.payment.preparedTx).toBe("abc123==");
        expect(payErr.payment.amount).toBe("0.01");
      }
    });

    it("throws generic Error on other non-2xx status", async () => {
      mockFetch(500, { error: "internal server error" });
      await expect(client.get("/path")).rejects.toThrow(/500/);
    });
  });

  describe("post()", () => {
    it("returns parsed JSON on 200", async () => {
      mockFetch(200, { quotes: [] });
      const result = await client.post<{ quotes: unknown[] }>("/swap/v2/quotes", { sellAmount: "100" });
      expect(result).toEqual({ quotes: [] });
    });

    it("sends Content-Type: application/json", async () => {
      const spy = mockFetch(200, {});
      await client.post("/path", {});
      const calledHeaders = ((spy.mock.calls[0] as unknown[])[1] as RequestInit).headers as Record<string, string>;
      expect(calledHeaders["Content-Type"]).toBe("application/json");
    });

    it("sends extra headers when provided", async () => {
      const spy = mockFetch(200, {});
      await client.post("/path", {}, { headers: { "x-api-key": "my-key" } });
      const calledHeaders = ((spy.mock.calls[0] as unknown[])[1] as RequestInit).headers as Record<string, string>;
      expect(calledHeaders["x-api-key"]).toBe("my-key");
    });

    it("throws RateLimitError on 429", async () => {
      mockFetch(429, { error: "rate_limit", retryAfterMs: 100 });
      await expect(client.post("/path", {})).rejects.toBeInstanceOf(RateLimitError);
    });

    it("throws PaymentRequiredError on 402", async () => {
      mockFetch(402, {
        error: "daily_limit_exceeded",
        limitType: "daily",
        payment: { network: "solana", token: "CASH", amount: "0.01", preparedTx: "tx==", description: "pay" },
      });
      await expect(client.post("/path", {})).rejects.toBeInstanceOf(PaymentRequiredError);
    });
  });

  describe("setGetHeaders()", () => {
    it("includes dynamic header returned by the callback on GET", async () => {
      const dynamicClient = new PhantomApiClient({ baseUrl: "https://api.phantom.app" });
      dynamicClient.setGetHeaders(() => ({ authorization: "Bearer token-abc" }));
      const spy = mockFetch(200, {});
      await dynamicClient.get("/path");
      const calledHeaders = ((spy.mock.calls[0] as unknown[])[1] as RequestInit).headers as Record<string, string>;
      expect(calledHeaders["authorization"]).toBe("Bearer token-abc");
    });

    it("includes dynamic header returned by the callback on POST", async () => {
      const dynamicClient = new PhantomApiClient({ baseUrl: "https://api.phantom.app" });
      dynamicClient.setGetHeaders(() => ({ authorization: "Bearer token-post" }));
      const spy = mockFetch(200, {});
      await dynamicClient.post("/path", {});
      const calledHeaders = ((spy.mock.calls[0] as unknown[])[1] as RequestInit).headers as Record<string, string>;
      expect(calledHeaders["authorization"]).toBe("Bearer token-post");
    });

    it("calls the callback on every request so token changes are reflected", async () => {
      const dynamicClient = new PhantomApiClient({ baseUrl: "https://api.phantom.app" });
      let token = "token-v1";
      dynamicClient.setGetHeaders(() => ({ authorization: `Bearer ${token}` }));

      const spy = mockFetch(200, {});
      await dynamicClient.get("/path");
      const firstHeaders = ((spy.mock.calls[0] as unknown[])[1] as RequestInit).headers as Record<string, string>;
      expect(firstHeaders["authorization"]).toBe("Bearer token-v1");

      token = "token-v2";
      await dynamicClient.get("/path");
      const secondHeaders = ((spy.mock.calls[1] as unknown[])[1] as RequestInit).headers as Record<string, string>;
      expect(secondHeaders["authorization"]).toBe("Bearer token-v2");
    });

    it("omits dynamic header keys whose value is undefined", async () => {
      const dynamicClient = new PhantomApiClient({ baseUrl: "https://api.phantom.app" });
      dynamicClient.setGetHeaders(() => ({ authorization: "Bearer token", "x-optional": undefined }));
      const spy = mockFetch(200, {});
      await dynamicClient.get("/path");
      const calledHeaders = ((spy.mock.calls[0] as unknown[])[1] as RequestInit).headers as Record<string, string>;
      expect(calledHeaders["authorization"]).toBe("Bearer token");
      expect(calledHeaders["x-optional"]).toBeUndefined();
    });

    it("dynamic headers override static headers with the same key", async () => {
      const dynamicClient = new PhantomApiClient({ baseUrl: "https://api.phantom.app" });
      dynamicClient.setHeaders({ authorization: "Bearer static-token" });
      dynamicClient.setGetHeaders(() => ({ authorization: "Bearer dynamic-token" }));
      const spy = mockFetch(200, {});
      await dynamicClient.get("/path");
      const calledHeaders = ((spy.mock.calls[0] as unknown[])[1] as RequestInit).headers as Record<string, string>;
      expect(calledHeaders["authorization"]).toBe("Bearer dynamic-token");
    });

    it("per-request extra headers override dynamic headers", async () => {
      const dynamicClient = new PhantomApiClient({ baseUrl: "https://api.phantom.app" });
      dynamicClient.setGetHeaders(() => ({ "x-custom": "from-dynamic" }));
      const spy = mockFetch(200, {});
      await dynamicClient.get("/path", { headers: { "x-custom": "from-extra" } });
      const calledHeaders = ((spy.mock.calls[0] as unknown[])[1] as RequestInit).headers as Record<string, string>;
      expect(calledHeaders["x-custom"]).toBe("from-extra");
    });
  });

  describe("setPaymentSignature()", () => {
    it("includes X-Payment header in subsequent requests after setPaymentSignature", async () => {
      const payingClient = new PhantomApiClient({ baseUrl: "https://api.phantom.app" });
      payingClient.setPaymentSignature("sig-abc123");
      const spy = mockFetch(200, {});
      await payingClient.get("/path");
      const calledHeaders = ((spy.mock.calls[0] as unknown[])[1] as RequestInit).headers as Record<string, string>;
      expect(calledHeaders["X-Payment"]).toBe("sig-abc123");
    });

    it("does not include X-Payment header before setPaymentSignature is called", async () => {
      const freshClient = new PhantomApiClient({ baseUrl: "https://api.phantom.app" });
      const spy = mockFetch(200, {});
      await freshClient.get("/path");
      const calledHeaders = ((spy.mock.calls[0] as unknown[])[1] as RequestInit).headers as Record<string, string>;
      expect(calledHeaders["X-Payment"]).toBeUndefined();
    });
  });

  describe("payment handler — auto-pay and retry", () => {
    const payment402 = {
      error: "daily_limit_exceeded",
      limitType: "daily",
      payment: {
        network: "solana",
        token: "CASH",
        amount: "0.01",
        preparedTx: "base64tx==",
        description: "Pay 0.01 CASH",
      },
    };

    it("auto-pays and retries GET on 402 when handler is set", async () => {
      const handler = jest.fn().mockResolvedValue("payment-sig-xyz");
      const apiClient = new PhantomApiClient({
        baseUrl: "https://api.phantom.app",
        onPaymentRequired: handler,
      });

      const spy = jest
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce({ ok: false, status: 402, json: () => Promise.resolve(payment402) } as Response)
        .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ data: "ok" }) } as Response);

      const result = await apiClient.get<{ data: string }>("/path");

      expect(handler).toHaveBeenCalledWith(payment402.payment);
      expect(spy).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ data: "ok" });
    });

    it("retry carries X-Payment header with signature returned by the handler", async () => {
      const handler = jest.fn().mockResolvedValue("the-payment-sig");
      const apiClient = new PhantomApiClient({
        baseUrl: "https://api.phantom.app",
        onPaymentRequired: handler,
      });

      const spy = jest
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce({ ok: false, status: 402, json: () => Promise.resolve(payment402) } as Response)
        .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);

      await apiClient.get("/path");

      const retryHeaders = ((spy.mock.calls[1] as unknown[])[1] as RequestInit).headers as Record<string, string>;
      expect(retryHeaders["X-Payment"]).toBe("the-payment-sig");
    });

    it("auto-pays and retries POST on 402 when handler is set", async () => {
      const handler = jest.fn().mockResolvedValue("post-payment-sig");
      const apiClient = new PhantomApiClient({
        baseUrl: "https://api.phantom.app",
        onPaymentRequired: handler,
      });

      jest
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce({ ok: false, status: 402, json: () => Promise.resolve(payment402) } as Response)
        .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ quotes: [] }) } as Response);

      const result = await apiClient.post<{ quotes: unknown[] }>("/swap/v2/quotes", { amount: "100" });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ quotes: [] });
    });

    it("throws PaymentRequiredError on 402 when no handler is set", async () => {
      const apiClient = new PhantomApiClient({ baseUrl: "https://api.phantom.app" });
      mockFetch(402, payment402);
      await expect(apiClient.get("/path")).rejects.toBeInstanceOf(PaymentRequiredError);
    });

    it("propagates handler error without retrying if payment signing fails", async () => {
      const handler = jest.fn().mockRejectedValue(new Error("insufficient CASH balance"));
      const apiClient = new PhantomApiClient({
        baseUrl: "https://api.phantom.app",
        onPaymentRequired: handler,
      });

      jest
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce({ ok: false, status: 402, json: () => Promise.resolve(payment402) } as Response);

      await expect(apiClient.get("/path")).rejects.toThrow("insufficient CASH balance");
    });

    it("setPaymentHandler() wires handler after construction and auto-pays", async () => {
      const apiClient = new PhantomApiClient({ baseUrl: "https://api.phantom.app" });
      const handler = jest.fn().mockResolvedValue("late-wired-sig");

      jest
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce({ ok: false, status: 402, json: () => Promise.resolve(payment402) } as Response)
        .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) } as Response);

      apiClient.setPaymentHandler(handler);
      const result = await apiClient.get<{ ok: boolean }>("/path");

      expect(handler).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ ok: true });
    });
  });
});
