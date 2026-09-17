// NOTE: EmbeddedSolanaChain imports @phantom/parsers, which pulls in @solana/web3.js.
// In this Jest setup, some transitive deps ship ESM browser builds that Jest won't transform.
// We only need to test connection state derivation here, so we mock those heavy deps.
jest.mock("@solana/web3.js", () => ({}), { virtual: true });
jest.mock("@phantom/parsers", () => ({
  parseSolanaSignedTransaction: jest.fn(),
}));

describe("EmbeddedSolanaChain", () => {
  let EmbeddedSolanaChain: any;
  let mockProvider: any;
  let solanaChain: any;

  beforeEach(() => {
    // Require after mocks are registered
    ({ EmbeddedSolanaChain } = require("./SolanaChain"));

    mockProvider = {
      isConnected: jest.fn().mockReturnValue(false),
      getAddresses: jest.fn().mockReturnValue([]),
      signMessage: jest.fn().mockResolvedValue({ signature: "3vQB7B6MrGQZaxCuFg4oh" } as any),
      signTransaction: jest.fn().mockResolvedValue({ rawTransaction: "" } as any),
      signAndSendTransaction: jest.fn().mockResolvedValue({ hash: "sig", rawTransaction: "" } as any),
      disconnect: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      off: jest.fn(),
    } as any;

    solanaChain = new EmbeddedSolanaChain(mockProvider);
  });

  const connect = async () => {
    mockProvider.isConnected.mockReturnValue(true);
    mockProvider.getAddresses.mockReturnValue([
      { addressType: "Solana", address: "So11111111111111111111111111111111111111112" },
    ]);
    await solanaChain.connect();
  };

  it("derives isConnected from existence of cached publicKey", async () => {
    expect(solanaChain.publicKey).toBeNull();
    expect(solanaChain.isConnected).toBe(false);

    mockProvider.isConnected.mockReturnValue(true);
    mockProvider.getAddresses.mockReturnValue([
      { addressType: "Solana", address: "So11111111111111111111111111111111111111112" },
    ]);

    await solanaChain.connect();

    expect(solanaChain.publicKey).toBe("So11111111111111111111111111111111111111112");
    expect(solanaChain.isConnected).toBe(true);
  });

  it("initializes disconnected when provider is disconnected (even if addresses exist)", () => {
    mockProvider.isConnected.mockReturnValue(false);
    mockProvider.getAddresses.mockReturnValue([
      { addressType: "Solana", address: "So11111111111111111111111111111111111111112" },
    ]);

    expect(solanaChain.publicKey).toBeNull();
    expect(solanaChain.isConnected).toBe(false);
  });

  it.each([
    ["00 ff 80", new Uint8Array([0x00, 0xff, 0x80])],
    ["ff fe", new Uint8Array([0xff, 0xfe])],
    ["an overlong encoding", new Uint8Array([0xc0, 0xaf])],
    ["a truncated multibyte sequence", new Uint8Array([0xe2, 0x82])],
    ["an isolated continuation byte", new Uint8Array([0x80])],
    ["a 32-byte challenge containing invalid UTF-8", new Uint8Array([...new Uint8Array(31).fill(0x61), 0xff])],
  ])("rejects %s before calling the provider", async (_name, message) => {
    await connect();

    await expect(solanaChain.signMessage(message)).rejects.toThrow("Solana message bytes must be valid UTF-8");

    expect(mockProvider.signMessage).not.toHaveBeenCalled();
  });

  it.each([
    ["ASCII", new TextEncoder().encode("hello")],
    ["Unicode", new TextEncoder().encode("雪☃")],
    ["an embedded NUL", new Uint8Array([0x41, 0x00, 0x42])],
    ["an empty message", new Uint8Array()],
    ["a leading UTF-8 BOM", new Uint8Array([0xef, 0xbb, 0xbf, 0x41])],
    ["a valid 32-byte UTF-8 challenge", new TextEncoder().encode("0123456789abcdef0123456789abcdef")],
  ])("accepts %s and preserves its UTF-8 bytes", async (_name, message) => {
    await connect();

    await solanaChain.signMessage(message);

    const forwardedMessage = mockProvider.signMessage.mock.calls[0][0].message;
    expect(forwardedMessage).toEqual(expect.any(String));
    expect(Array.from(new TextEncoder().encode(forwardedMessage))).toEqual(Array.from(message));
  });
});
