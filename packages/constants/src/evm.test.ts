import { parseEvmChainId } from "./evm";

describe("parseEvmChainId", () => {
  it.each([
    [137n, 137n],
    [137, 137n],
    ["137", 137n],
    [" 137 ", 137n],
    ["0X89", 137n],
  ])("parses %p", (value, expected) => {
    expect(parseEvmChainId(value)).toBe(expected);
  });

  it.each([-1n, -1, Number.MAX_SAFE_INTEGER + 1, "", " ", "0x", "0xzz", "1.5", {}])("rejects %p", value => {
    expect(() => parseEvmChainId(value)).toThrow(`Invalid chainId: ${String(value)}`);
  });

  it("uses the supplied error label", () => {
    expect(() => parseEvmChainId("invalid", "EVM chainId")).toThrow("Invalid EVM chainId: invalid");
  });
});
