import { getPerpPositionsTool } from "./get-perp-positions";

const mockPerpsClient = { getPositions: jest.fn() };

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

const POSITIONS = [
  {
    coin: "BTC",
    direction: "long",
    size: "0.1",
    margin: "500",
    entryPrice: "50000",
    leverage: { type: "isolated", value: 10 },
    unrealizedPnl: "50",
    liquidationPrice: "45000",
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  const { createPerpsClient } = jest.requireMock("../utils/perps");
  (createPerpsClient as jest.Mock).mockResolvedValue(mockPerpsClient);
  mockPerpsClient.getPositions.mockResolvedValue(POSITIONS);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("get_perp_positions", () => {
  it("has correct name and readOnly annotation", () => {
    expect(getPerpPositionsTool.name).toBe("get_perp_positions");
    expect(getPerpPositionsTool.annotations?.readOnlyHint).toBe(true);
  });

  it("returns positions list", async () => {
    const result = await getPerpPositionsTool.handler({}, makeContext() as any);
    expect(result).toEqual(POSITIONS);
    expect(mockPerpsClient.getPositions).toHaveBeenCalledTimes(1);
  });

  it("returns empty array when no positions", async () => {
    mockPerpsClient.getPositions.mockResolvedValue([]);
    const result = await getPerpPositionsTool.handler({}, makeContext() as any);
    expect(result).toEqual([]);
  });
});
