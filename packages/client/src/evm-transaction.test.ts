import { NetworkId } from "@phantom/constants";
import { Transaction, decodeRlp, encodeRlp } from "ethers";
import { normalizeEvmTransactionForNetwork } from "./evm-transaction";

const to = "0x0000000000000000000000000000000000000001";
const legacy = { nonce: 0, gasLimit: 21_000, gasPrice: 1, to, value: 1 };
const typed = {
  type: 2,
  nonce: 0,
  gasLimit: 21_000,
  maxFeePerGas: 2,
  maxPriorityFeePerGas: 1,
  to,
  value: 1,
};
const unboundLegacy = encodeRlp(["0x", "0x01", "0x5208", to, "0x01", "0x"]);

function decode(transaction: string): Transaction {
  return Transaction.from(transaction);
}

describe("normalizeEvmTransactionForNetwork", () => {
  it.each([
    [NetworkId.ETHEREUM_MAINNET, 1n],
    [NetworkId.POLYGON_MAINNET, 137n],
  ])("injects the network chain ID into legacy transactions for %s", (networkId, chainId) => {
    expect(decode(normalizeEvmTransactionForNetwork(legacy, networkId)).chainId).toBe(chainId);
  });

  it.each([0, "0", "0x0", 0n])("rejects an explicit structured chainId of zero: %s", chainId => {
    expect(() => normalizeEvmTransactionForNetwork({ ...typed, chainId }, NetworkId.POLYGON_MAINNET)).toThrow(
      "Unsupported EVM transaction chainId: 0",
    );
  });

  it.each([undefined, null])("injects the network chain ID for a nullish structured chainId: %s", chainId => {
    const result = normalizeEvmTransactionForNetwork({ ...typed, chainId }, NetworkId.POLYGON_MAINNET);

    expect(decode(result).chainId).toBe(137n);
  });

  it.each(["137", "0x89"])("accepts matching decimal and hex chainId strings: %s", chainId => {
    const result = normalizeEvmTransactionForNetwork({ ...typed, chainId }, NetworkId.POLYGON_MAINNET);

    expect(decode(result).chainId).toBe(137n);
  });

  it("rejects a supported chainId that mismatches the selected network", () => {
    expect(() => normalizeEvmTransactionForNetwork({ ...legacy, chainId: 137 }, NetworkId.ETHEREUM_MAINNET)).toThrow(
      "chainId 137 does not match network chainId 1",
    );
  });

  it("rejects unsupported and invalid chain IDs", () => {
    expect(() => normalizeEvmTransactionForNetwork({ ...legacy, chainId: 56 }, NetworkId.ETHEREUM_MAINNET)).toThrow(
      "Unsupported EVM transaction chainId: 56",
    );
    expect(() =>
      normalizeEvmTransactionForNetwork({ ...legacy, chainId: "not-a-chain" }, NetworkId.ETHEREUM_MAINNET),
    ).toThrow("Invalid EVM chainId");
    expect(() => normalizeEvmTransactionForNetwork(legacy, "eip155:56")).toThrow("Unsupported EVM network ID");
  });

  it("rejects an invalid mixed-case destination checksum", () => {
    expect(() =>
      normalizeEvmTransactionForNetwork(
        { ...legacy, to: "0x8Ba1f109551bD432803012645Ac136ddd64DBA72" },
        NetworkId.ETHEREUM_MAINNET,
      ),
    ).toThrow("bad address checksum");
  });

  it("decodes and binds raw legacy RLP instead of passing it through", () => {
    const result = normalizeEvmTransactionForNetwork(unboundLegacy, NetworkId.POLYGON_MAINNET);

    expect(result).not.toBe(unboundLegacy);
    expect(decode(result).chainId).toBe(137n);
  });

  it("rejects explicit zero chain IDs in raw typed and EIP-155 legacy transactions", () => {
    const typedZero = Transaction.from({ ...typed, chainId: 0 }).unsignedSerialized;
    const legacyFields = decodeRlp(unboundLegacy) as string[];
    const eip155Zero = encodeRlp([...legacyFields, "0x", "0x", "0x"]);

    expect(() => normalizeEvmTransactionForNetwork(typedZero, NetworkId.POLYGON_MAINNET)).toThrow(
      "Unsupported EVM transaction chainId: 0",
    );
    expect(() => normalizeEvmTransactionForNetwork(eip155Zero, NetworkId.POLYGON_MAINNET)).toThrow(
      "Unsupported EVM transaction chainId: 0",
    );
  });

  it("decodes raw typed RLP and rejects a mismatched chain ID", () => {
    const polygonTransaction = Transaction.from({ ...typed, chainId: 137 }).unsignedSerialized;

    expect(() => normalizeEvmTransactionForNetwork(polygonTransaction, NetworkId.ETHEREUM_MAINNET)).toThrow(
      "chainId 137 does not match network chainId 1",
    );
  });

  it("rejects a serializer object whose declared chainId mismatches", () => {
    const serialized = Transaction.from({ ...legacy, chainId: 0 }).unsignedSerialized;

    expect(() =>
      normalizeEvmTransactionForNetwork({ chainId: 137, serialize: () => serialized }, NetworkId.ETHEREUM_MAINNET),
    ).toThrow("chainId 137 does not match network chainId 1");
  });

  it("validates byte input and rejects malformed or signed transactions", () => {
    const bytes = Uint8Array.from(Buffer.from(unboundLegacy.slice(2), "hex"));
    expect(decode(normalizeEvmTransactionForNetwork(bytes, NetworkId.ETHEREUM_MAINNET)).chainId).toBe(1n);
    expect(() => normalizeEvmTransactionForNetwork("0x010203", NetworkId.ETHEREUM_MAINNET)).toThrow(
      "Invalid serialized EVM transaction",
    );

    const signed = Transaction.from({
      ...legacy,
      chainId: 1,
      signature: {
        r: `0x${"01".padStart(64, "0")}`,
        s: `0x${"02".padStart(64, "0")}`,
        v: 27,
      },
    }).serialized;
    expect(() => normalizeEvmTransactionForNetwork(signed, NetworkId.ETHEREUM_MAINNET)).toThrow(
      "already signed EVM transaction",
    );
  });
});
