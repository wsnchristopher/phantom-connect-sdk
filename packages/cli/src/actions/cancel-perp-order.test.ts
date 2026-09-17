import { cancelPerpOrderTool } from "./cancel-perp-order";

const mockPerpsClient = { cancelOrder: jest.fn() };

jest.mock("../utils/perps", () => ({ createPerpsClient: jest.fn() }));

const makeContext = () => {
  const client = {};
  const session = { walletId: "wallet-1", organizationId: "org-1" };
  return {
    client,
    session,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    manager: {
      getClient: () => client,
      getSession: () => session,
    },
  };
};

beforeEach(() => {
  jest.clearAllMocks();
  const { createPerpsClient } = jest.requireMock("../utils/perps");
  (createPerpsClient as jest.Mock).mockResolvedValue(mockPerpsClient);
  mockPerpsClient.cancelOrder.mockResolvedValue({ status: "ok", data: {} });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("cancel_perp_order", () => {
  it("has correct name and destructive annotation", () => {
    expect(cancelPerpOrderTool.name).toBe("cancel_perp_order");
    expect(cancelPerpOrderTool.annotations?.destructiveHint).toBe(true);
    expect(cancelPerpOrderTool.inputSchema.required).toContain("market");
    expect(cancelPerpOrderTool.inputSchema.required).toContain("orderId");
  });

  it("calls cancelOrder with market and orderId", async () => {
    await cancelPerpOrderTool.handler({ market: "BTC", orderId: 42 }, makeContext() as any);
    expect(mockPerpsClient.cancelOrder).toHaveBeenCalledWith({ market: "BTC", orderId: 42 });
  });

  it("throws when market is missing", async () => {
    await expect(cancelPerpOrderTool.handler({ orderId: 42 }, makeContext() as any)).rejects.toMatchObject({
      name: "ZodError",
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: ["market"],
          message: "Invalid input: expected string, received undefined",
        }),
      ]),
    });
  });

  it("throws when orderId is missing or not a safe integer", async () => {
    const ctx = makeContext() as any;
    const nanMsg = "Invalid input: expected number, received NaN";
    await expect(cancelPerpOrderTool.handler({ market: "BTC" }, ctx)).rejects.toMatchObject({
      name: "ZodError",
      issues: expect.arrayContaining([expect.objectContaining({ path: ["orderId"], message: nanMsg })]),
    });
    await expect(cancelPerpOrderTool.handler({ market: "BTC", orderId: "not-a-number" }, ctx)).rejects.toMatchObject({
      name: "ZodError",
      issues: expect.arrayContaining([expect.objectContaining({ path: ["orderId"], message: nanMsg })]),
    });
    await expect(cancelPerpOrderTool.handler({ market: "BTC", orderId: NaN }, ctx)).rejects.toMatchObject({
      name: "ZodError",
      issues: expect.arrayContaining([expect.objectContaining({ path: ["orderId"], message: nanMsg })]),
    });
    await expect(cancelPerpOrderTool.handler({ market: "BTC", orderId: Infinity }, ctx)).rejects.toMatchObject({
      name: "ZodError",
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: ["orderId"],
          message: "Invalid input: expected number, received number",
        }),
      ]),
    });
    await expect(cancelPerpOrderTool.handler({ market: "BTC", orderId: 42.5 }, ctx)).rejects.toMatchObject({
      name: "ZodError",
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: ["orderId"],
          message: "Invalid input: expected int, received number",
        }),
      ]),
    });
  });
});
