import { getPerpMarketsTool } from "./get-perp-markets";

const mockPerpsClient = {
  getMarkets: jest.fn(),
};

jest.mock("../utils/perps", () => ({
  createPerpsClient: jest.fn(),
  createAnonymousPerpsClient: jest.fn(),
}));

const makeContext = (overrides: Record<string, unknown> = {}) => {
  const client = { ...overrides };
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

const MARKETS = [
  {
    symbol: "BTC",
    name: "Bitcoin",
    assetId: 0,
    maxLeverage: 50,
    szDecimals: 5,
    price: "50000",
    priceChange24h: { amount: "1000", percentage: "2.00" },
    fundingRate: "0.0001",
    openInterest: "1000000",
    volume24h: "5000000",
    isAtOpenInterestCap: false,
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    assetId: 1,
    maxLeverage: 25,
    szDecimals: 4,
    price: "3000",
    priceChange24h: { amount: "60", percentage: "2.04" },
    fundingRate: "0.0002",
    openInterest: "500000",
    volume24h: "2000000",
    isAtOpenInterestCap: false,
  },
];

const HIP3_MARKET = {
  symbol: "xyz:BTC",
  name: "xyz Bitcoin",
  assetId: 100000,
  maxLeverage: 20,
  szDecimals: 5,
  price: "50000",
  priceChange24h: { amount: "500", percentage: "1.00" },
  fundingRate: "0.0001",
  openInterest: "100000",
  volume24h: "500000",
  isAtOpenInterestCap: false,
  collateralToken: { tokenIndex: 5, pairIndex: 2 },
};

beforeEach(() => {
  jest.clearAllMocks();
  const { createPerpsClient, createAnonymousPerpsClient } = jest.requireMock("../utils/perps");
  (createPerpsClient as jest.Mock).mockResolvedValue(mockPerpsClient);
  (createAnonymousPerpsClient as jest.Mock).mockReturnValue(mockPerpsClient);
  mockPerpsClient.getMarkets.mockResolvedValue(MARKETS);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("get_perp_markets", () => {
  it("has correct name and readOnly annotation", () => {
    expect(getPerpMarketsTool.name).toBe("get_perp_markets");
    expect(getPerpMarketsTool.annotations?.readOnlyHint).toBe(true);
    expect(getPerpMarketsTool.annotations?.destructiveHint).toBe(false);
  });

  it("returns markets list", async () => {
    const ctx = makeContext();
    const result = await getPerpMarketsTool.handler({}, ctx as any);
    expect(result).toEqual(MARKETS);
    expect(mockPerpsClient.getMarkets).toHaveBeenCalledTimes(1);
  });

  it("uses session walletId when not in params", async () => {
    const ctx = makeContext();
    await getPerpMarketsTool.handler({}, ctx as any);
    const { createPerpsClient } = jest.requireMock("../utils/perps");
    expect(createPerpsClient).toHaveBeenCalledWith(ctx, "wallet-1");
  });

  it("uses explicit walletId from params", async () => {
    const ctx = makeContext();
    await getPerpMarketsTool.handler({ walletId: "other-wallet" }, ctx as any);
    const { createPerpsClient } = jest.requireMock("../utils/perps");
    expect(createPerpsClient).toHaveBeenCalledWith(ctx, "other-wallet");
  });

  it("uses anonymous client when no walletId is available", async () => {
    const session = { walletId: undefined };
    const ctx = {
      ...makeContext(),
      session,
      manager: { getClient: jest.fn(), getSession: () => session },
    };
    const result = await getPerpMarketsTool.handler({}, ctx as any);
    expect(result).toEqual(MARKETS);
    const { createAnonymousPerpsClient } = jest.requireMock("../utils/perps");
    expect(createAnonymousPerpsClient).toHaveBeenCalledWith(ctx);
  });

  it("returns HIP-3 markets with DEX:SYMBOL format and collateralToken", async () => {
    mockPerpsClient.getMarkets.mockResolvedValue([...MARKETS, HIP3_MARKET]);
    const result = (await getPerpMarketsTool.handler({}, makeContext() as any)) as any[];
    const hip3 = result.find((m: any) => m.symbol === "xyz:BTC");
    expect(hip3).toBeDefined();
    expect(hip3.collateralToken).toEqual({ tokenIndex: 5, pairIndex: 2 });
  });

  it("propagates API errors", async () => {
    mockPerpsClient.getMarkets.mockRejectedValue(new Error("API error"));
    const ctx = makeContext();
    await expect(getPerpMarketsTool.handler({}, ctx as any)).rejects.toThrow("API error");
  });
});
