import { getTokenPriceTool } from "./get-token-price";

const SOLANA_ADDRESS = "So11111111111111111111111111111111111111112";
const EVM_ADDRESS = "0xabc0000000000000000000000000000000000001";
const USDC_ADDRESS = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

const mockFetchPortfolioBalance = jest.fn();

jest.mock("../utils/portfolio", () => ({
  ALL_NETWORKS: ["solana", "ethereum", "base", "polygon", "arbitrum", "bitcoin", "sui", "monad"],
  NETWORK_CONFIGS: {
    solana: { addressType: "solana", caip19Prefix: "solana:101" },
    ethereum: { addressType: "ethereum", caip19Prefix: "eip155:1" },
    base: { addressType: "ethereum", caip19Prefix: "eip155:8453" },
    polygon: { addressType: "ethereum", caip19Prefix: "eip155:137" },
  },
  fetchPortfolioBalance: (...args: unknown[]) => mockFetchPortfolioBalance(...args),
}));

jest.mock("../utils/tokens", () => ({
  NATIVE_TOKEN_CAIP19: {
    solana: "solana:101/nativeToken:501",
    ethereum: "eip155:1/nativeToken:60",
    base: "eip155:8453/nativeToken:8453",
  },
}));

const makeContext = (addressType = "ethereum", address = EVM_ADDRESS) => {
  const client = {
    getWalletAddresses: jest.fn().mockResolvedValue([{ addressType, address }]),
  };
  const session = { walletId: "wallet-1", organizationId: "org-1" };
  const apiClient = {};
  return {
    client,
    session,
    apiClient,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    manager: {
      getClient: () => client,
      getSession: () => session,
    },
  };
};

const makePortfolioItem = (overrides: Record<string, unknown> = {}) => ({
  name: "USD Coin",
  symbol: "USDC",
  caip19: `eip155:8453/erc20:${USDC_ADDRESS}`,
  price: { price: 1.0, priceChange24h: 0.01, lastUpdatedAt: "2024-01-01T00:00:00Z", marketCap: 40_000_000_000 },
  ...overrides,
});

beforeEach(() => {
  jest.spyOn(process.stderr, "write").mockImplementation(() => true);
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("get_token_price — schema", () => {
  it("has the correct tool name", () => {
    expect(getTokenPriceTool.name).toBe("get_token_price");
  });

  it("requires address and chain", () => {
    expect(getTokenPriceTool.inputSchema.required).toEqual(expect.arrayContaining(["address", "chain"]));
  });

  it("is marked read-only", () => {
    expect(getTokenPriceTool.annotations?.readOnlyHint).toBe(true);
  });
});

describe("get_token_price — handler", () => {
  it("returns price for a contract address on an EVM chain", async () => {
    const ctx = makeContext();
    mockFetchPortfolioBalance.mockResolvedValue({ items: [makePortfolioItem()] });

    const result = (await getTokenPriceTool.handler({ address: USDC_ADDRESS, chain: "base" }, ctx as any)) as any;

    expect(result.name).toBe("USD Coin");
    expect(result.symbol).toBe("USDC");
    expect(result.price).toBe(1.0);
    expect(result.priceChange24h).toBe(0.01);
    expect(result.currency).toBe("USD");
    expect(result.marketCap).toBe(40_000_000_000);
    expect(result.lastUpdatedAt).toBe("2024-01-01T00:00:00Z");
  });

  it("returns price for the native token when address is 'native'", async () => {
    const ctx = makeContext("solana", SOLANA_ADDRESS);
    const solItem = makePortfolioItem({ name: "Solana", symbol: "SOL", caip19: "solana:101/nativeToken:501" });
    mockFetchPortfolioBalance.mockResolvedValue({ items: [solItem] });

    const result = (await getTokenPriceTool.handler({ address: "native", chain: "solana" }, ctx as any)) as any;

    expect(result.symbol).toBe("SOL");
    expect(result.price).toBe(1.0);
  });

  it("passes 'native' case-insensitively", async () => {
    const ctx = makeContext("solana", SOLANA_ADDRESS);
    mockFetchPortfolioBalance.mockResolvedValue({ items: [makePortfolioItem({ symbol: "SOL" })] });

    await getTokenPriceTool.handler({ address: "NATIVE", chain: "solana" }, ctx as any);

    const [[, params]] = mockFetchPortfolioBalance.mock.calls;
    expect(params.fungibleAddresses).toContain("solana:101/nativeToken:501");
  });

  it("builds the correct CAIP-19 fungibleAddress for a contract token", async () => {
    const ctx = makeContext();
    mockFetchPortfolioBalance.mockResolvedValue({ items: [makePortfolioItem()] });

    await getTokenPriceTool.handler({ address: USDC_ADDRESS, chain: "base" }, ctx as any);

    const [[, params]] = mockFetchPortfolioBalance.mock.calls;
    expect(params.fungibleAddresses).toEqual([`eip155:8453/address:${USDC_ADDRESS}`]);
  });

  it("uses the wallet address matching the chain's addressType for the walletAddresses param", async () => {
    const ctx = makeContext("ethereum", EVM_ADDRESS);
    mockFetchPortfolioBalance.mockResolvedValue({ items: [makePortfolioItem()] });

    await getTokenPriceTool.handler({ address: USDC_ADDRESS, chain: "base" }, ctx as any);

    const [[, params]] = mockFetchPortfolioBalance.mock.calls;
    expect(params.walletAddresses).toEqual([`eip155:8453/address:${EVM_ADDRESS}`]);
  });

  it("defaults currency to USD when not specified", async () => {
    const ctx = makeContext();
    mockFetchPortfolioBalance.mockResolvedValue({ items: [makePortfolioItem()] });

    const result = (await getTokenPriceTool.handler({ address: USDC_ADDRESS, chain: "base" }, ctx as any)) as any;

    expect(result.currency).toBe("USD");
    const [[, params]] = mockFetchPortfolioBalance.mock.calls;
    expect(params.currency).toBe("USD");
  });

  it("forwards a custom currency to fetchPortfolioBalance", async () => {
    const ctx = makeContext();
    mockFetchPortfolioBalance.mockResolvedValue({ items: [makePortfolioItem()] });

    const result = (await getTokenPriceTool.handler(
      { address: USDC_ADDRESS, chain: "base", currency: "EUR" },
      ctx as any,
    )) as any;

    expect(result.currency).toBe("EUR");
    const [[, params]] = mockFetchPortfolioBalance.mock.calls;
    expect(params.currency).toBe("EUR");
  });

  it("returns null for price fields when the portfolio item has no price data", async () => {
    const ctx = makeContext();
    mockFetchPortfolioBalance.mockResolvedValue({
      items: [makePortfolioItem({ price: undefined })],
    });

    const result = (await getTokenPriceTool.handler({ address: USDC_ADDRESS, chain: "base" }, ctx as any)) as any;

    expect(result.price).toBeNull();
    expect(result.priceChange24h).toBeNull();
    expect(result.marketCap).toBeNull();
    expect(result.lastUpdatedAt).toBeUndefined();
  });

  it("throws for a chain not present in NETWORK_CONFIGS", async () => {
    const ctx = makeContext();
    await expect(getTokenPriceTool.handler({ address: USDC_ADDRESS, chain: "arbitrum" }, ctx as any)).rejects.toThrow(
      "Unsupported chain",
    );
  });

  it("throws when no wallet address is found for the chain", async () => {
    const ctx = makeContext("solana", SOLANA_ADDRESS); // only has solana, not ethereum
    await expect(getTokenPriceTool.handler({ address: USDC_ADDRESS, chain: "ethereum" }, ctx as any)).rejects.toThrow(
      "No wallet address found for chain",
    );
  });

  it("throws when the native token CAIP-19 is unknown for the chain", async () => {
    const ctx = makeContext("polygon", "0xpolygon");
    // polygon is in NETWORK_CONFIGS but not in NATIVE_TOKEN_CAIP19 mock
    await expect(getTokenPriceTool.handler({ address: "native", chain: "polygon" }, ctx as any)).rejects.toThrow(
      "Native token not known for chain",
    );
  });

  it("throws when the token is not found in the portfolio response", async () => {
    const ctx = makeContext();
    mockFetchPortfolioBalance.mockResolvedValue({ items: [] });

    await expect(getTokenPriceTool.handler({ address: USDC_ADDRESS, chain: "base" }, ctx as any)).rejects.toThrow(
      "Token not found or price unavailable",
    );
  });
});
