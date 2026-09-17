import { withdrawFromPerpsTool } from "./withdraw-from-perps";

const mockPerpsClient = { withdrawFromSpot: jest.fn() };

jest.mock("../utils/perps", () => ({ createPerpsClient: jest.fn() }));
jest.mock("../utils/solana", () => ({
  getSolanaAddress: jest.fn().mockResolvedValue("G37x7vFjCQfHD2WU2zLLQ2b2tSHXhpePtzUzesGG35q"),
}));
jest.mock("../utils/evm", () => ({
  getEthereumAddress: jest.fn().mockResolvedValue("0x6484ce5200d78542156d5cd5e964dfa7e49d9b62"),
}));

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
  mockPerpsClient.withdrawFromSpot.mockResolvedValue({ requestId: "0xabc", details: {}, execution: {} });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("withdraw_from_perps", () => {
  it("has correct name, required fields, and destructive annotation", () => {
    expect(withdrawFromPerpsTool.name).toBe("withdraw_from_perps");
    expect(withdrawFromPerpsTool.inputSchema.required).toContain("amountUsdc");
    expect(withdrawFromPerpsTool.inputSchema.required).toContain("destinationChainId");
    expect(withdrawFromPerpsTool.annotations?.destructiveHint).toBe(true);
  });

  it("calls withdrawFromSpot with correct params for Solana destination", async () => {
    await withdrawFromPerpsTool.handler(
      { amountUsdc: "50", destinationChainId: "solana:mainnet" },
      makeContext() as any,
    );
    expect(mockPerpsClient.withdrawFromSpot).toHaveBeenCalledWith(
      expect.objectContaining({
        amountUsdc: "50",
        destinationChainId: "solana:101",
        destinationAddress: "G37x7vFjCQfHD2WU2zLLQ2b2tSHXhpePtzUzesGG35q",
      }),
    );
  });

  it("calls withdrawFromSpot with EVM address for EVM destination", async () => {
    await withdrawFromPerpsTool.handler({ amountUsdc: "10", destinationChainId: "eip155:8453" }, makeContext() as any);
    expect(mockPerpsClient.withdrawFromSpot).toHaveBeenCalledWith(
      expect.objectContaining({
        amountUsdc: "10",
        destinationChainId: "eip155:8453",
        destinationAddress: "0x6484ce5200d78542156d5cd5e964dfa7e49d9b62",
      }),
    );
  });

  it("throws when amountUsdc is missing", async () => {
    await expect(
      withdrawFromPerpsTool.handler({ destinationChainId: "solana:mainnet" }, makeContext() as any),
    ).rejects.toMatchObject({
      name: "ZodError",
      issues: expect.arrayContaining([expect.objectContaining({ path: ["amountUsdc"] })]),
    });
  });

  it("throws when destinationChainId is missing", async () => {
    await expect(withdrawFromPerpsTool.handler({ amountUsdc: "50" }, makeContext() as any)).rejects.toMatchObject({
      name: "ZodError",
      issues: expect.arrayContaining([expect.objectContaining({ path: ["destinationChainId"] })]),
    });
  });

  it("propagates errors from withdrawFromSpot", async () => {
    mockPerpsClient.withdrawFromSpot.mockRejectedValue(new Error("Bridge failed"));
    await expect(
      withdrawFromPerpsTool.handler({ amountUsdc: "50", destinationChainId: "solana:mainnet" }, makeContext() as any),
    ).rejects.toThrow("Bridge failed");
  });
});
