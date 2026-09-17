import { getPerpOrdersTool } from "./get-perp-orders";

const mockPerpsClient = { getOpenOrders: jest.fn() };

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

const ORDERS = [
  {
    id: "12345",
    coin: "BTC",
    side: "long",
    type: "limit",
    limitPrice: "49000",
    triggerPrice: "0",
    size: "0.1",
    reduceOnly: false,
    timestamp: 1700000000000,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  const { createPerpsClient } = jest.requireMock("../utils/perps");
  (createPerpsClient as jest.Mock).mockResolvedValue(mockPerpsClient);
  mockPerpsClient.getOpenOrders.mockResolvedValue(ORDERS);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("get_perp_orders", () => {
  it("has correct name and readOnly annotation", () => {
    expect(getPerpOrdersTool.name).toBe("get_perp_orders");
    expect(getPerpOrdersTool.annotations?.readOnlyHint).toBe(true);
  });

  it("returns open orders list", async () => {
    const result = await getPerpOrdersTool.handler({}, makeContext() as any);
    expect(result).toEqual(ORDERS);
    expect(mockPerpsClient.getOpenOrders).toHaveBeenCalledTimes(1);
  });
});
