import { transferSpotToPerpsTool } from "./transfer-spot-to-perps";

const mockPerpsClient = { deposit: jest.fn() };

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
  mockPerpsClient.deposit.mockResolvedValue({ status: "ok", data: {} });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("transfer_spot_to_perps", () => {
  it("has correct name and required fields", () => {
    expect(transferSpotToPerpsTool.name).toBe("transfer_spot_to_perps");
    expect(transferSpotToPerpsTool.inputSchema.required).toContain("amountUsdc");
    expect(transferSpotToPerpsTool.annotations?.destructiveHint).toBe(false);
  });

  it("calls deposit with the USDC amount", async () => {
    await transferSpotToPerpsTool.handler({ amountUsdc: "100" }, makeContext() as any);
    expect(mockPerpsClient.deposit).toHaveBeenCalledWith("100");
  });

  const invalidPositiveAmountMsg = "Must be a positive number string (e.g. '100' or '10.5')";

  it("throws when amountUsdc is missing or invalid", async () => {
    await expect(transferSpotToPerpsTool.handler({}, makeContext() as any)).rejects.toMatchObject({
      name: "ZodError",
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: ["amountUsdc"],
          message: "Invalid input: expected string, received undefined",
        }),
      ]),
    });
  });

  it.each(["", "   ", "all", "-100", "0", "abc", "Infinity", "-Infinity", "NaN"])(
    "throws for invalid amountUsdc value %p",
    async bad => {
      await expect(transferSpotToPerpsTool.handler({ amountUsdc: bad }, makeContext() as any)).rejects.toMatchObject({
        name: "ZodError",
        issues: expect.arrayContaining([
          expect.objectContaining({ path: ["amountUsdc"], message: invalidPositiveAmountMsg }),
        ]),
      });
    },
  );

  it("passes amountUsdc directly to deposit", async () => {
    await transferSpotToPerpsTool.handler({ amountUsdc: "100" }, makeContext() as any);
    expect(mockPerpsClient.deposit).toHaveBeenCalledWith("100");
  });

  it("propagates deposit errors", async () => {
    mockPerpsClient.deposit.mockRejectedValue(new Error("Insufficient spot balance"));
    await expect(transferSpotToPerpsTool.handler({ amountUsdc: "999999" }, makeContext() as any)).rejects.toThrow(
      "Insufficient spot balance",
    );
  });
});
