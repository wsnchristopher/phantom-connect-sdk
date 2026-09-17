import { chainIdToNetworkId, networkIdToChainId, parseEvmChainId, type NetworkId } from "@phantom/constants";
import { Transaction as EthersTransaction, decodeRlp, getAddress, hexlify } from "ethers";

type TransactionRecord = Record<string, unknown>;
type SerializerRecord = TransactionRecord & { serialize: () => unknown };
type ParsedTransactionInput = { transaction: EthersTransaction; chainIdMissing: boolean };

const SIMPLE_VALUE_TRANSFER_INTRINSIC_GAS_LIMIT = "0x5208"; // 21,000 gas, the EVM intrinsic cost of a simple value transfer.

function getExpectedChainId(networkId: string): bigint {
  const configuredChainId = networkIdToChainId(networkId as NetworkId);
  if (configuredChainId === undefined) {
    throw new Error(`Unsupported EVM network ID: ${networkId}`);
  }
  return BigInt(configuredChainId);
}

function bindChainId(chainId: unknown, expectedChainId: bigint): bigint {
  if (chainId == null) return expectedChainId;

  const actualChainId = parseEvmChainId(chainId, "EVM chainId");

  if (actualChainId > BigInt(Number.MAX_SAFE_INTEGER) || !chainIdToNetworkId(Number(actualChainId))) {
    throw new Error(`Unsupported EVM transaction chainId: ${actualChainId}`);
  }

  if (actualChainId !== expectedChainId) {
    throw new Error(`EVM transaction chainId ${actualChainId} does not match network chainId ${expectedChainId}`);
  }

  return actualChainId;
}

function parseSerializedTransaction(transaction: string | Uint8Array): ParsedTransactionInput {
  try {
    const serialized = typeof transaction === "string" ? transaction : hexlify(transaction);
    const parsed = EthersTransaction.from(serialized);
    let chainIdMissing = false;
    try {
      const decoded = decodeRlp(serialized);
      chainIdMissing = Array.isArray(decoded) && decoded.length === 6;
    } catch {
      // Typed EIP-2718 envelopes are not top-level RLP lists.
    }
    return { transaction: parsed, chainIdMissing };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid serialized EVM transaction: ${message}`);
  }
}

function parseSerializerObject(serializable: SerializerRecord, expectedChainId: bigint): ParsedTransactionInput {
  bindChainId(serializable.chainId, expectedChainId);
  const serialized = serializable.serialize();
  if (typeof serialized !== "string" && !(serialized instanceof Uint8Array)) {
    throw new Error("EVM transaction serialize() must return hex or bytes");
  }
  return parseSerializedTransaction(serialized);
}

function prepareTransactionRequest(serializable: TransactionRecord, expectedChainId: bigint): TransactionRecord {
  const { from: _from, gas, ...tx } = serializable;
  if (gas != null) tx.gasLimit = gas;
  if (tx.gasLimit == null && tx.to && tx.value != null && !tx.data) {
    tx.gasLimit = SIMPLE_VALUE_TRANSFER_INTRINSIC_GAS_LIMIT;
  }

  if (typeof tx.to === "string") tx.to = getAddress(tx.to);
  tx.chainId = bindChainId(tx.chainId, expectedChainId);
  return tx;
}

function parseStructuredTransaction(serializable: TransactionRecord, expectedChainId: bigint): ParsedTransactionInput {
  try {
    return {
      transaction: EthersTransaction.from(prepareTransactionRequest(serializable, expectedChainId)),
      chainIdMissing: false,
    };
  } catch (error) {
    if (error instanceof Error && /^(?:Invalid|Unsupported|Cannot|EVM transaction)/.test(error.message)) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to encode EVM transaction: ${message}`);
  }
}

function parseTransactionInput(transaction: unknown, expectedChainId: bigint): ParsedTransactionInput {
  if (typeof transaction === "string") {
    if (!transaction.startsWith("0x")) {
      throw new Error("Serialized EVM transactions must be 0x-prefixed hex strings");
    }
    return parseSerializedTransaction(transaction);
  }

  if (transaction instanceof Uint8Array) return parseSerializedTransaction(transaction);
  if (!transaction || typeof transaction !== "object") {
    throw new Error("Unsupported EVM transaction format");
  }

  const serializable = transaction as TransactionRecord;
  return typeof serializable.serialize === "function"
    ? parseSerializerObject(serializable as SerializerRecord, expectedChainId)
    : parseStructuredTransaction(serializable, expectedChainId);
}

export function normalizeEvmTransactionForNetwork(transaction: unknown, networkId: string): string {
  const expectedChainId = getExpectedChainId(networkId);
  const { transaction: parsed, chainIdMissing } = parseTransactionInput(transaction, expectedChainId);

  if (parsed.isSigned()) {
    throw new Error("Cannot sign an already signed EVM transaction");
  }

  parsed.chainId = bindChainId(chainIdMissing ? undefined : parsed.chainId, expectedChainId);
  return parsed.unsignedSerialized;
}
