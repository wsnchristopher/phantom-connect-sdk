import { updatePerpLeverageTool } from "./update-perp-leverage";

const mockPerpsClient = { updateLeverage: jest.fn() };

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
  mockPerpsClient.updateLeverage.mockResolvedValue({ status: "ok", data: {} });
});

afterEach(() => {
  jest.restoreAllMocks();
});

const VALID_PARAMS = { market: "BTC", leverage: 10, marginType: "isolated" };

describe("update_perp_leverage", () => {
  it("has correct name, required fields, and destructive annotation", () => {
    expect(updatePerpLeverageTool.name).toBe("update_perp_leverage");
    expect(updatePerpLeverageTool.inputSchema.required).toContain("market");
    expect(updatePerpLeverageTool.inputSchema.required).toContain("leverage");
    expect(updatePerpLeverageTool.inputSchema.required).toContain("marginType");
    expect(updatePerpLeverageTool.annotations?.destructiveHint).toBe(true);
  });

  it("calls updateLeverage with correct params (isolated)", async () => {
    await updatePerpLeverageTool.handler(VALID_PARAMS, makeContext() as any);
    expect(mockPerpsClient.updateLeverage).toHaveBeenCalledWith({
      market: "BTC",
      leverage: 10,
      marginType: "isolated",
    });
  });

  it("calls updateLeverage with cross margin type", async () => {
    await updatePerpLeverageTool.handler({ ...VALID_PARAMS, marginType: "cross" }, makeContext() as any);
    expect(mockPerpsClient.updateLeverage).toHaveBeenCalledWith(expect.objectContaining({ marginType: "cross" }));
  });

  it("throws for invalid marginType", async () => {
    await expect(
      updatePerpLeverageTool.handler({ ...VALID_PARAMS, marginType: "hedge" }, makeContext() as any),
    ).rejects.toMatchObject({
      name: "ZodError",
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: ["marginType"],
          message: 'Invalid option: expected one of "cross"|"isolated"',
        }),
      ]),
    });
  });

  it.each([
    ["ten", "Invalid input: expected number, received NaN"],
    [NaN, "Invalid input: expected number, received NaN"],
    [Infinity, "Invalid input: expected number, received number"],
    [0, "Too small: expected number to be >=1"],
    [-1, "Too small: expected number to be >=1"],
    [0.5, "Too small: expected number to be >=1"],
  ])("throws for invalid leverage value %p", async (bad, message) => {
    await expect(
      updatePerpLeverageTool.handler({ ...VALID_PARAMS, leverage: bad }, makeContext() as any),
    ).rejects.toMatchObject({
      name: "ZodError",
      issues: expect.arrayContaining([expect.objectContaining({ path: ["leverage"], message })]),
    });
  });

  it("throws when market is missing", async () => {
    await expect(
      updatePerpLeverageTool.handler({ leverage: 10, marginType: "cross" }, makeContext() as any),
    ).rejects.toMatchObject({
      name: "ZodError",
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: ["market"],
          message: "Invalid input: expected string, received undefined",
        }),
      ]),
    });
  });
});
