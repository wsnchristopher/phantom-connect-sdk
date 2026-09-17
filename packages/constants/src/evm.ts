export function parseEvmChainId(value: unknown, label = "chainId"): bigint {
  const input = value;
  const invalid = () => new Error(`Invalid ${label}: ${String(input)}`);

  if (typeof value === "number" && !Number.isSafeInteger(value)) throw invalid();
  if (typeof value === "string") value = value.trim();
  if (value === "" || (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint")) {
    throw invalid();
  }

  try {
    const chainId = BigInt(value);
    if (chainId < 0n) throw invalid();
    return chainId;
  } catch {
    throw invalid();
  }
}
