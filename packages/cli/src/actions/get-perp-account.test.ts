import { getPerpAccountTool } from "./get-perp-account";

const mockPerpsClient = { getBalance: jest.fn() };

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

const BALANCE = { accountValue: "500.00", availableBalance: "300.00", availableToTrade: "300.00", dexs: {} };

beforeEach(() => {
  jest.clearAllMocks();
  const { createPerpsClient } = jest.requireMock("../utils/perps");
  (createPerpsClient as jest.Mock).mockResolvedValue(mockPerpsClient);
  mockPerpsClient.getBalance.mockResolvedValue(BALANCE);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("get_perp_account", () => {
  it("has correct name and readOnly annotation", () => {
    expect(getPerpAccountTool.name).toBe("get_perp_account");
    expect(getPerpAccountTool.annotations?.readOnlyHint).toBe(true);
  });

  it("returns account balance", async () => {
    const result = await getPerpAccountTool.handler({}, makeContext() as any);
    expect(result).toEqual(BALANCE);
    expect(mockPerpsClient.getBalance).toHaveBeenCalledTimes(1);
  });

  it("passes derivationIndex to createPerpsClient", async () => {
    const ctx = makeContext();
    await getPerpAccountTool.handler({ derivationIndex: 2 }, ctx as any);
    const { createPerpsClient } = jest.requireMock("../utils/perps");
    expect(createPerpsClient).toHaveBeenCalledWith(ctx, "wallet-1", 2);
  });

  it("propagates API errors", async () => {
    mockPerpsClient.getBalance.mockRejectedValue(new Error("balance fetch failed"));
    await expect(getPerpAccountTool.handler({}, makeContext() as any)).rejects.toThrow("balance fetch failed");
  });

  it("returns HIP-3 dex balances when dexs is non-empty", async () => {
    const balanceWithDex = {
      ...BALANCE,
      dexs: { WOOF: { accountValue: "50.00", availableBalance: "50.00", availableToTrade: "50.00" } },
    };
    mockPerpsClient.getBalance.mockResolvedValue(balanceWithDex);
    const result = await getPerpAccountTool.handler({}, makeContext() as any);
    expect(result).toEqual(balanceWithDex);
    expect((result as typeof balanceWithDex).dexs.WOOF.accountValue).toBe("50.00");
  });

  it("includes collateralBalances when present", async () => {
    const balanceWithCollateral = {
      ...BALANCE,
      collateralBalances: [{ tokenIndex: 5, pairIndex: 2, symbol: "PURR", total: "100", hold: "0" }],
    };
    mockPerpsClient.getBalance.mockResolvedValue(balanceWithCollateral);
    const result = await getPerpAccountTool.handler({}, makeContext() as any);
    expect(result).toEqual(balanceWithCollateral);
  });

  it("includes dexAbstraction when present", async () => {
    const balanceWithAbstraction = { ...BALANCE, dexAbstraction: true };
    mockPerpsClient.getBalance.mockResolvedValue(balanceWithAbstraction);
    const result = await getPerpAccountTool.handler({}, makeContext() as any);
    expect((result as typeof balanceWithAbstraction).dexAbstraction).toBe(true);
  });
});
