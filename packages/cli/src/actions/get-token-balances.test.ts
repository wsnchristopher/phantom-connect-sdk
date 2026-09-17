import { getTokenBalancesTool } from "./get-token-balances";

const mockResolveNetworks = jest.fn();
const mockFetchPortfolioBalances = jest.fn();

jest.mock("../utils/portfolio", () => ({
  ALL_NETWORKS: ["solana", "ethereum", "base"],
  resolveNetworks: (...args: unknown[]) => mockResolveNetworks(...args),
  fetchPortfolioBalances: (...args: unknown[]) => mockFetchPortfolioBalances(...args),
}));

describe("get_token_balances", () => {
  beforeEach(() => {
    mockResolveNetworks.mockReset();
    mockFetchPortfolioBalances.mockReset();
  });

  it("resolves requested networks and forwards to fetchPortfolioBalances", async () => {
    const ctx = { session: { walletId: "wallet-1" } };
    const balances = { items: [{ symbol: "SOL", totalQuantity: 1 }] };
    mockResolveNetworks.mockReturnValue(["solana"]);
    mockFetchPortfolioBalances.mockResolvedValue(balances);

    const result = await getTokenBalancesTool.handler({ networks: ["solana"] }, ctx as any);

    expect(mockResolveNetworks).toHaveBeenCalledWith(["solana"]);
    expect(mockFetchPortfolioBalances).toHaveBeenCalledWith(ctx, ["solana"]);
    expect(result).toEqual(balances);
  });

  it("handles empty network params by using resolved default networks", async () => {
    const ctx = { session: { walletId: "wallet-1" } };
    mockResolveNetworks.mockReturnValue(["solana", "ethereum"]);
    mockFetchPortfolioBalances.mockResolvedValue({ items: [] });

    const result = await getTokenBalancesTool.handler({}, ctx as any);

    expect(mockResolveNetworks).toHaveBeenCalledWith(undefined);
    expect(mockFetchPortfolioBalances).toHaveBeenCalledWith(ctx, ["solana", "ethereum"]);
    expect(result).toEqual({ items: [] });
  });
});
