/**
 * Unit tests for PerpsClient.
 *
 * PerpsApi is mocked so tests run without HTTP. Focuses on order-size computation
 * and API response handling — input validation is the responsibility of callers.
 */

import { PerpsClient } from "./PerpsClient";

// ── PerpsApi mock ─────────────────────────────────────────────────────────────

const mockApi = {
  getAccountBalance: jest.fn(),
  getPositionsAndOpenOrders: jest.fn(),
  getTradeHistory: jest.fn(),
  getFundingHistory: jest.fn(),
  getMarkets: jest.fn(),
  getAllMarkets: jest.fn(),
  getTrendingMarkets: jest.fn(),
  postPlaceOrder: jest.fn(),
  postCancelOrder: jest.fn(),
  postUpdateLeverage: jest.fn(),
  postTransferUsdcSpotPerp: jest.fn(),
};

jest.mock("./api", () => ({
  PerpsApi: jest.fn().mockImplementation(() => mockApi),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const MOCK_MARKET = {
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
};

const MOCK_HIP3_MARKET = {
  ...MOCK_MARKET,
  symbol: "xyz:BTC",
  name: "xyz Bitcoin",
  assetId: 100000,
};

const MOCK_POSITION = {
  coin: "BTC",
  direction: "long" as const,
  size: "0.01",
  margin: "500",
  entryPrice: "50000",
  leverage: { type: "unknown" as const, value: 10 },
  unrealizedPnl: "0",
  liquidationPrice: null,
};

const OK_RESPONSE = { status: "ok", response: { type: "order", data: { statuses: [] } } };

const mockApiClient = {
  get: jest.fn(),
  post: jest.fn(),
};

function makeClient(): PerpsClient {
  return new PerpsClient({
    evmAddress: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    signTypedData: () => Promise.resolve("0x" + "a".repeat(64) + "b".repeat(64) + "1b"),
    apiClient: mockApiClient,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.getMarkets.mockResolvedValue([MOCK_MARKET]);
  mockApi.getPositionsAndOpenOrders.mockResolvedValue({ positions: [MOCK_POSITION], openOrders: [] });
  mockApi.postPlaceOrder.mockResolvedValue(OK_RESPONSE);
  mockApi.postCancelOrder.mockResolvedValue({ status: "ok" });
  mockApi.postUpdateLeverage.mockResolvedValue({ status: "ok" });
  mockApi.postTransferUsdcSpotPerp.mockResolvedValue({ status: "ok" });
});

// ── openPosition ──────────────────────────────────────────────────────────────

describe("openPosition", () => {
  const VALID: Parameters<PerpsClient["openPosition"]>[0] = {
    market: "BTC",
    direction: "long",
    sizeUsd: "100",
    leverage: 10,
    orderType: "market",
  };

  it("succeeds with valid params", async () => {
    const client = makeClient();
    await expect(client.openPosition(VALID)).resolves.toBeDefined();
  });

  it.each([["0"], ["-100"], ["abc"], ["1e5"], [" 100"], ["100 "]])("rejects sizeUsd=%j", async bad => {
    const client = makeClient();
    await expect(client.openPosition({ ...VALID, sizeUsd: bad })).rejects.toThrow("sizeUsd");
  });

  it("rejects when market price is zero/NaN", async () => {
    mockApi.getMarkets.mockResolvedValue([{ ...MOCK_MARKET, price: "0" }]);
    const client = makeClient();
    await expect(client.openPosition(VALID)).rejects.toThrow("Invalid market price");
  });

  it("rejects when order size rounds to zero", async () => {
    // sizeUsd=0.000001 at price=50000 → rawSize ~2e-11 → rounds to 0 at 5 decimals
    mockApi.getMarkets.mockResolvedValue([{ ...MOCK_MARKET, price: "50000" }]);
    const client = makeClient();
    await expect(client.openPosition({ ...VALID, sizeUsd: "0.000001" })).rejects.toThrow("Order size rounds to zero");
  });
});

// ── closePosition ─────────────────────────────────────────────────────────────

describe("closePosition", () => {
  it("succeeds with no sizePercent (full close)", async () => {
    const client = makeClient();
    await expect(client.closePosition({ market: "BTC" })).resolves.toBeDefined();
  });

  it("succeeds with valid sizePercent", async () => {
    const client = makeClient();
    await expect(client.closePosition({ market: "BTC", sizePercent: 50 })).resolves.toBeDefined();
  });

  it("rejects when no open position exists", async () => {
    mockApi.getPositionsAndOpenOrders.mockResolvedValue({ positions: [], openOrders: [] });
    const client = makeClient();
    await expect(client.closePosition({ market: "BTC" })).rejects.toThrow("No open position for market: BTC");
  });

  it("rejects when position.size is '0' (zero position)", async () => {
    mockApi.getPositionsAndOpenOrders.mockResolvedValue({
      positions: [{ ...MOCK_POSITION, size: "0" }],
      openOrders: [],
    });
    const client = makeClient();
    await expect(client.closePosition({ market: "BTC" })).rejects.toThrow("Invalid position size");
  });

  it("rejects when position.size is malformed (NaN)", async () => {
    mockApi.getPositionsAndOpenOrders.mockResolvedValue({
      positions: [{ ...MOCK_POSITION, size: "not-a-number" }],
      openOrders: [],
    });
    const client = makeClient();
    await expect(client.closePosition({ market: "BTC" })).rejects.toThrow("Invalid position size");
  });

  it("handles short positions (negative size) correctly via Math.abs", async () => {
    // Shorts are represented with negative size; Math.abs must normalise it
    mockApi.getPositionsAndOpenOrders.mockResolvedValue({
      positions: [{ ...MOCK_POSITION, size: "-0.01", direction: "short" }],
      openOrders: [],
    });
    const client = makeClient();
    await expect(client.closePosition({ market: "BTC" })).resolves.toBeDefined();
  });

  it("rejects when sizePercent is so small the close size rounds to zero", async () => {
    // position.size = 0.000001 → formatSize(0.000001, 5) = "0.00000" → rejects
    mockApi.getPositionsAndOpenOrders.mockResolvedValue({
      positions: [{ ...MOCK_POSITION, size: "0.000001" }],
      openOrders: [],
    });
    const client = makeClient();
    await expect(client.closePosition({ market: "BTC" })).rejects.toThrow("Close size rounds to zero");
  });
});

// ── cancelOrder ───────────────────────────────────────────────────────────────

describe("cancelOrder", () => {
  it("succeeds with a valid safe integer orderId", async () => {
    const client = makeClient();
    await expect(client.cancelOrder({ market: "BTC", orderId: 42 })).resolves.toBeDefined();
  });
});

// ── updateLeverage ────────────────────────────────────────────────────────────

describe("updateLeverage", () => {
  const VALID: Parameters<PerpsClient["updateLeverage"]>[0] = {
    market: "BTC",
    leverage: 10,
    marginType: "isolated",
  };

  it("succeeds with valid params", async () => {
    const client = makeClient();
    await expect(client.updateLeverage(VALID)).resolves.toBeDefined();
  });
});

// ── deposit ───────────────────────────────────────────────────────────────────

describe("deposit", () => {
  it("succeeds with a valid amount", async () => {
    const client = makeClient();
    await expect(client.deposit("100")).resolves.toBeDefined();
  });

  it.each([["0"], ["-50"], ["all"], ["abc"], ["   "], [""], [" 100"], ["1e5"]])("rejects amountUsdc=%j", async bad => {
    const client = makeClient();
    await expect(client.deposit(bad)).rejects.toThrow("amountUsdc");
  });
});

// ── withdraw ──────────────────────────────────────────────────────────────────

describe("withdraw", () => {
  it("succeeds with a valid amount", async () => {
    const client = makeClient();
    await expect(client.withdraw("50.5")).resolves.toBeDefined();
  });

  it.each([["0"], ["-10"], ["all"], ["abc"], [" 50"], ["1e5"]])("rejects amountUsdc=%j", async bad => {
    const client = makeClient();
    await expect(client.withdraw(bad)).rejects.toThrow("amountUsdc");
  });
});

// ── requireAssetId guard ──────────────────────────────────────────────────────

describe("requireAssetId guard", () => {
  const marketWithoutAssetId = { ...MOCK_MARKET, assetId: undefined };

  it("openPosition throws when market has no assetId", async () => {
    mockApi.getMarkets.mockResolvedValue([marketWithoutAssetId]);
    const client = makeClient();
    await expect(
      client.openPosition({ market: "BTC", direction: "long", sizeUsd: "100", leverage: 10, orderType: "market" }),
    ).rejects.toThrow("assetId not returned by backend for market BTC");
  });

  it("closePosition throws when market has no assetId", async () => {
    mockApi.getMarkets.mockResolvedValue([marketWithoutAssetId]);
    const client = makeClient();
    await expect(client.closePosition({ market: "BTC" })).rejects.toThrow(
      "assetId not returned by backend for market BTC",
    );
  });

  it("cancelOrder throws when market has no assetId", async () => {
    mockApi.getMarkets.mockResolvedValue([marketWithoutAssetId]);
    const client = makeClient();
    await expect(client.cancelOrder({ market: "BTC", orderId: 42 })).rejects.toThrow(
      "assetId not returned by backend for market BTC",
    );
  });

  it("updateLeverage throws when market has no assetId", async () => {
    mockApi.getMarkets.mockResolvedValue([marketWithoutAssetId]);
    const client = makeClient();
    await expect(client.updateLeverage({ market: "BTC", leverage: 10, marginType: "isolated" })).rejects.toThrow(
      "assetId not returned by backend for market BTC",
    );
  });
});

// ── HIP-3 market lookup ───────────────────────────────────────────────────────

describe("HIP-3 market lookup", () => {
  beforeEach(() => {
    mockApi.getMarkets.mockResolvedValue([MOCK_HIP3_MARKET]);
    mockApi.getPositionsAndOpenOrders.mockResolvedValue({
      positions: [{ ...MOCK_POSITION, coin: "xyz:BTC" }],
      openOrders: [],
    });
  });

  it("passes symbol as-is in CAIP-19 (no case transformation)", async () => {
    const client = makeClient();
    await client.openPosition({
      market: "xyz:BTC",
      direction: "long",
      sizeUsd: "100",
      leverage: 5,
      orderType: "market",
    });
    expect(mockApi.getMarkets).toHaveBeenCalledWith(["hypercore:mainnet/address:xyz:BTC"]);
  });

  it("throws when HIP-3 market is not found", async () => {
    mockApi.getMarkets.mockResolvedValue([]);
    const client = makeClient();
    await expect(
      client.openPosition({ market: "xyz:BTC", direction: "long", sizeUsd: "100", leverage: 5, orderType: "market" }),
    ).rejects.toThrow("Market not found: xyz:BTC");
  });
});
