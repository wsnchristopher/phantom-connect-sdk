import { createAnonymousPerpsClient, createPerpsClient } from "./perps";

const mockPerpsCtor = jest.fn();
const mockGetEthereumAddress = jest.fn();

jest.mock("@phantom/perps-client", () => ({
  PerpsClient: jest.fn().mockImplementation((...args) => {
    mockPerpsCtor(...args);
    return { __kind: "PerpsClientMock" };
  }),
}));

jest.mock("./evm", () => ({
  getEthereumAddress: (...args: unknown[]) => mockGetEthereumAddress(...args),
}));

describe("perps utils", () => {
  beforeEach(() => {
    mockPerpsCtor.mockReset();
    mockGetEthereumAddress.mockReset();
  });

  it("creates anonymous perps client with unauthenticated signer", async () => {
    const context = {
      logger: { child: jest.fn().mockReturnValue({}) },
      apiClient: { request: jest.fn() },
    };

    const client = createAnonymousPerpsClient(context as any);
    expect(client).toEqual({ __kind: "PerpsClientMock" });

    const config = mockPerpsCtor.mock.calls[0][0];
    expect(config.evmAddress).toBe("0x0000000000000000000000000000000000000000");
    await expect(config.signTypedData({})).rejects.toThrow("Not authenticated");
  });

  it("creates authenticated perps client with arbitrum typed-data signer", async () => {
    mockGetEthereumAddress.mockResolvedValue("0x1234");
    const ethereumSignTypedData = jest.fn().mockResolvedValue("typedSig");
    const loggerChild = {};
    const phantomClient = { ethereumSignTypedData };
    const context = {
      client: phantomClient,
      logger: { child: jest.fn().mockReturnValue(loggerChild) },
      apiClient: { request: jest.fn() },
      manager: {
        getClient: () => phantomClient,
      },
    };

    const client = await createPerpsClient(context as any, "wallet-1", 7);
    expect(client).toEqual({ __kind: "PerpsClientMock" });

    expect(mockGetEthereumAddress).toHaveBeenCalledWith(context, "wallet-1", 7);
    const config = mockPerpsCtor.mock.calls[0][0];
    expect(config.evmAddress).toBe("0x1234");
    expect(config.logger).toBe(loggerChild);
    expect(config.apiClient).toBe(context.apiClient);

    const typedData = { domain: { name: "x" } };
    await config.signTypedData(typedData);
    expect(ethereumSignTypedData).toHaveBeenCalledWith({
      walletId: "wallet-1",
      typedData,
      networkId: "eip155:42161",
      derivationIndex: 7,
    });
  });
});
