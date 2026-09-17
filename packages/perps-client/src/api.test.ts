import { PerpsApi } from "./api";

const VALID_RELAY_V2_QUOTE = {
  requestId: "test-request-id",
  authorizeStep: {
    id: "authorize" as const,
    domain: {
      name: "Relay",
      version: "1",
      chainId: 1,
      verifyingContract: "0x0000000000000000000000000000000000000000",
    },
    types: {},
    primaryType: "Authorize",
    message: {},
    postEndpoint: "/swap/v2/spot/authorize",
    postBody: {},
  },
  depositStep: {
    id: "deposit" as const,
    action: {},
    nonce: 1,
    eip712Types: {},
    eip712PrimaryType: "Deposit",
    checkEndpoint: "/swap/v2/spot/get-intents-status",
  },
  details: { amountIn: "100000000", amountOut: "99000000" },
};

describe("PerpsApi", () => {
  it("uses the backend-expected RelayV2 bridge provider casing", async () => {
    const apiClient = {
      get: jest.fn().mockResolvedValue(VALID_RELAY_V2_QUOTE),
      post: jest.fn(),
    };

    const api = new PerpsApi({ apiClient });
    await api.getBridgeInitialize({
      buyToken: "solana:101/address:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      takerDestination: "solana:101/address:dest",
      sellAmount: "1000000",
      sourceWallet: "hypercore:mainnet/address:0xabc",
    });

    expect(apiClient.get).toHaveBeenCalledWith("/swap/v2/spot/bridge-initialize", {
      params: expect.objectContaining({
        bridgeProvider: "RelayV2",
      }),
    });
  });
});
