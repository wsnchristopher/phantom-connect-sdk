import { closePerpPositionTool } from "./close-perp-position";

const mockPerpsClient = { closePosition: jest.fn() };

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
  mockPerpsClient.closePosition.mockResolvedValue({ status: "ok", data: {} });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("close_perp_position", () => {
  it("has correct name and destructive annotation", () => {
    expect(closePerpPositionTool.name).toBe("close_perp_position");
    expect(closePerpPositionTool.annotations?.destructiveHint).toBe(true);
    expect(closePerpPositionTool.inputSchema.required).toContain("market");
  });

  it("calls closePosition with market and 100 sizePercent by default", async () => {
    await closePerpPositionTool.handler({ market: "BTC" }, makeContext() as any);
    const { createPerpsClient } = jest.requireMock("../utils/perps");
    expect(createPerpsClient).toHaveBeenCalledWith(expect.anything(), "wallet-1", 0);
    expect(mockPerpsClient.closePosition).toHaveBeenCalledWith({ market: "BTC", sizePercent: 100 });
  });

  it("passes sizePercent when provided", async () => {
    await closePerpPositionTool.handler({ market: "ETH", sizePercent: 50 }, makeContext() as any);
    expect(mockPerpsClient.closePosition).toHaveBeenCalledWith({ market: "ETH", sizePercent: 50 });
  });

  it("throws when market is missing or whitespace-only", async () => {
    const ctx = makeContext() as any;
    await expect(closePerpPositionTool.handler({}, ctx)).rejects.toMatchObject({
      name: "ZodError",
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: ["market"],
          message: "Invalid input: expected string, received undefined",
        }),
      ]),
    });
    await expect(closePerpPositionTool.handler({ market: "   " }, ctx)).rejects.toMatchObject({
      name: "ZodError",
      issues: expect.arrayContaining([expect.objectContaining({ path: ["market"], message: "market is required" })]),
    });
  });

  it("throws for invalid sizePercent values", async () => {
    const ctx = makeContext() as any;
    await expect(closePerpPositionTool.handler({ market: "BTC", sizePercent: 0 }, ctx)).rejects.toMatchObject({
      name: "ZodError",
      issues: expect.arrayContaining([
        expect.objectContaining({ path: ["sizePercent"], message: "Too small: expected number to be >=1" }),
      ]),
    });
    await expect(closePerpPositionTool.handler({ market: "BTC", sizePercent: 101 }, ctx)).rejects.toMatchObject({
      name: "ZodError",
      issues: expect.arrayContaining([
        expect.objectContaining({ path: ["sizePercent"], message: "Too big: expected number to be <=100" }),
      ]),
    });
    const nanMsg = "Invalid input: expected number, received NaN";
    await expect(closePerpPositionTool.handler({ market: "BTC", sizePercent: NaN }, ctx)).rejects.toMatchObject({
      name: "ZodError",
      issues: expect.arrayContaining([expect.objectContaining({ path: ["sizePercent"], message: nanMsg })]),
    });
    await expect(closePerpPositionTool.handler({ market: "BTC", sizePercent: Infinity }, ctx)).rejects.toMatchObject({
      name: "ZodError",
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: ["sizePercent"],
          message: "Invalid input: expected number, received number",
        }),
      ]),
    });
  });

  it("propagates errors from closePosition", async () => {
    mockPerpsClient.closePosition.mockRejectedValue(new Error("No open position for market: BTC"));
    await expect(closePerpPositionTool.handler({ market: "BTC" }, makeContext() as any)).rejects.toThrow(
      "No open position for market: BTC",
    );
  });
});
