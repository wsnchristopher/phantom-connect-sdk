import { z } from "incur";
import { PaymentRequiredError, RateLimitError } from "@phantom/phantom-api-client";
import { createAction } from "./actions";

const makeContext = () => ({
  apiClient: {} as any,
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  manager: {
    isInitialized: jest.fn().mockReturnValue(true),
    getSession: jest.fn().mockReturnValue({ walletId: "wallet-1", organizationId: "org-1", appId: "app-1" }),
    getClient: jest.fn(),
    tryRefreshSession: jest.fn().mockResolvedValue(false),
    resetSession: jest.fn().mockResolvedValue(undefined),
  },
});

const makeAction = (run: (args: any) => Promise<any>) =>
  createAction({
    description: "Test action",
    options: z.object({ value: z.string().optional().describe("A value") }),
    output: z.object({ result: z.string() }),
    mcp: {
      command: "test_action",
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    run,
  });

describe("createAction", () => {
  describe("auth errors", () => {
    it("resets the session when token refresh cannot recover a 401", async () => {
      const ctx = makeContext();
      const action = makeAction(async () => {
        throw Object.assign(new Error("Unauthorized"), { response: { status: 401 } });
      });

      await expect(action.tool.handler({}, ctx as any)).rejects.toThrow(/^AUTH_EXPIRED:/);
      expect(ctx.manager.tryRefreshSession).toHaveBeenCalledTimes(1);
      expect(ctx.manager.resetSession).toHaveBeenCalledTimes(1);
    });

    it("resets the session when token refresh rejects", async () => {
      const ctx = makeContext();
      ctx.manager.tryRefreshSession.mockRejectedValueOnce(new Error("Refresh failed"));
      const action = makeAction(async () => {
        throw Object.assign(new Error("Unauthorized"), { response: { status: 401 } });
      });

      await expect(action.tool.handler({}, ctx as any)).rejects.toThrow(/^AUTH_EXPIRED:/);
      expect(ctx.manager.tryRefreshSession).toHaveBeenCalledTimes(1);
      expect(ctx.manager.resetSession).toHaveBeenCalledTimes(1);
    });

    it("refreshes and retries once before resetting the session on 401", async () => {
      const ctx = makeContext();
      ctx.manager.tryRefreshSession.mockResolvedValue(true);
      const run = jest
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error("Unauthorized"), { response: { status: 401 } }))
        .mockResolvedValueOnce({ result: "retried" });
      const action = makeAction(run);

      await expect(action.tool.handler({}, ctx as any)).resolves.toEqual({ result: "retried" });
      expect(ctx.manager.tryRefreshSession).toHaveBeenCalledTimes(1);
      expect(run).toHaveBeenCalledTimes(2);
      expect(ctx.manager.resetSession).not.toHaveBeenCalled();
    });

    it("calls resetSession and throws AUTH_EXPIRED on 403", async () => {
      const ctx = makeContext();
      const action = makeAction(async () => {
        throw Object.assign(new Error("Forbidden"), { response: { status: 403 } });
      });

      await expect(action.tool.handler({}, ctx as any)).rejects.toThrow(/^AUTH_EXPIRED:/);
      expect(ctx.manager.resetSession).toHaveBeenCalledTimes(1);
    });

    it("preserves submission-failed 403 errors without resetting the session", async () => {
      const ctx = makeContext();
      const submissionError = Object.assign(new Error("Transaction submission failed"), {
        response: {
          status: 403,
          data: {
            error: { code: -32009, message: "Transaction submission failed" },
            type: "submission-failed",
            title: "Transaction submission failed",
            detail: "Transaction submission failed",
            upstreamStatus: 403,
            requestId: "request-1",
          },
        },
      });
      const action = makeAction(async () => {
        throw submissionError;
      });

      const thrown = await action.tool.handler({}, ctx as any).catch(error => error);

      expect(thrown).toBe(submissionError);
      expect(thrown.response).toEqual({
        status: 403,
        data: {
          error: { code: -32009, message: "Transaction submission failed" },
          type: "submission-failed",
          title: "Transaction submission failed",
          detail: "Transaction submission failed",
          upstreamStatus: 403,
          requestId: "request-1",
        },
      });
      expect(ctx.manager.tryRefreshSession).not.toHaveBeenCalled();
      expect(ctx.manager.resetSession).not.toHaveBeenCalled();
    });

    it("rethrows non-auth errors without calling resetSession", async () => {
      const ctx = makeContext();
      const action = makeAction(async () => {
        throw new Error("some other error");
      });

      await expect(action.tool.handler({}, ctx as any)).rejects.toThrow("some other error");
      expect(ctx.manager.resetSession).not.toHaveBeenCalled();
    });

    it("rethrows errors with non-401/403 response status without calling resetSession", async () => {
      const ctx = makeContext();
      const action = makeAction(async () => {
        throw Object.assign(new Error("Not found"), { response: { status: 404 } });
      });

      await expect(action.tool.handler({}, ctx as any)).rejects.toThrow("Not found");
      expect(ctx.manager.resetSession).not.toHaveBeenCalled();
    });
  });

  describe("payment handling", () => {
    it("converts PaymentRequiredError in run() to structured {paymentRequired: true} result", async () => {
      const ctx = makeContext();
      const action = makeAction(async () => {
        throw new PaymentRequiredError("daily", {
          network: "solana:101",
          token: "CASH",
          amount: "0.1",
          preparedTx: "abc123",
          description: "Daily quota refill",
        });
      });

      const result = await action.tool.handler({}, ctx as any);
      expect(result).toEqual(
        expect.objectContaining({
          paymentRequired: true,
          limitType: "daily",
          token: "CASH",
          amount: "0.1",
          preparedTx: "abc123",
        }),
      );
      expect(ctx.manager.resetSession).not.toHaveBeenCalled();
    });

    it("converts RateLimitError in run() to structured {rateLimited: true} result", async () => {
      const ctx = makeContext();
      const action = makeAction(async () => {
        throw new RateLimitError(2000);
      });

      const result = await action.tool.handler({}, ctx as any);
      expect(result).toEqual(
        expect.objectContaining({
          rateLimited: true,
          retryAfterMs: 2000,
        }),
      );
      expect(ctx.manager.resetSession).not.toHaveBeenCalled();
    });
  });

  describe("double-wrap safety", () => {
    it("passes a structured PaymentRequired result from a delegated tool.handler through unchanged", async () => {
      // Simulates deposit_to_hyperliquid → buy_token: the inner handler already
      // converted a PaymentRequiredError to a structured object (not a thrown error),
      // so the outer wrapWithPaymentHandling should return it as-is.
      const innerPaymentResult = {
        paymentRequired: true as const,
        limitType: "daily" as const,
        amount: "0.5",
        token: "CASH",
        preparedTx: "tx123",
        message: "Pay to unlock",
      };

      const mockInnerHandler = jest.fn().mockResolvedValue(innerPaymentResult);

      const outerAction = createAction({
        description: "Outer delegating action",
        options: z.object({}),
        output: z.object({ result: z.string() }),
        mcp: {
          command: "outer_action",
          annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
        },
        run: async ({ var: context }) => mockInnerHandler({}, context),
      });

      const ctx = makeContext();
      const result = await outerAction.tool.handler({}, ctx as any);
      expect(result).toEqual(innerPaymentResult);
      expect(ctx.manager.resetSession).not.toHaveBeenCalled();
    });
  });

  describe("tool.inputSchema", () => {
    it("produces {type: 'object', properties, required} from the options schema", () => {
      const action = createAction({
        description: "Schema test",
        options: z.object({
          name: z.string().describe("User name"),
          count: z.coerce.number().default(1).describe("Count (default: 1)"),
          verbose: z.stringbool().default(false).describe("Enable verbose output (default: false)"),
          flag: z.boolean().optional().describe("Optional flag"),
        }),
        output: z.object({ ok: z.boolean() }),
        mcp: {
          command: "schema_test",
          annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
        },
        run: async () => ({ ok: true }),
      });

      const schema = action.tool.inputSchema;
      expect(schema.type).toBe("object");
      expect(schema.properties).toHaveProperty("name");
      expect(schema.properties).toHaveProperty("count");
      expect(schema.properties).toHaveProperty("verbose");
      expect(schema.properties).toHaveProperty("flag");
      expect(schema.required).toContain("name");
      expect(schema.required).not.toContain("count"); // has default → optional at input
      expect(schema.required).not.toContain("verbose"); // has default → optional at input
      expect(schema.required).not.toContain("flag"); // .optional()
    });
  });
});
