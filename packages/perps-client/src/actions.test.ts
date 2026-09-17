import {
  splitSignature,
  nextNonce,
  formatPrice,
  formatSize,
  resolveLimitPrice,
  buildExchangeActionTypedData,
  buildUsdClassTransferTypedData,
} from "./actions";
import type { HlOrderAction, HlCancelAction, HlUpdateLeverageAction, HlUsdClassTransferAction } from "./schemas";

// ── splitSignature ───────────────────────────────────────────────────────────

describe("splitSignature", () => {
  it("splits a 65-byte hex signature into r, s, v", () => {
    const r = "a".repeat(64);
    const s = "b".repeat(64);
    const v = "1b"; // 27
    const result = splitSignature(`0x${r}${s}${v}`);
    expect(result.r).toBe(`0x${r}`);
    expect(result.s).toBe(`0x${s}`);
    expect(result.v).toBe(27);
  });

  it("handles v = 28 (0x1c) in hex format", () => {
    const sig = `0x${"0".repeat(64)}${"0".repeat(64)}1c`;
    expect(splitSignature(sig).v).toBe(28);
  });

  it("decodes a base64url-encoded 65-byte signature (KMS format)", () => {
    // Build known 65 bytes: r = 0xaa*32, s = 0xbb*32, v = 0x1b (27)
    const bytes = Buffer.alloc(65);
    bytes.fill(0xaa, 0, 32);
    bytes.fill(0xbb, 32, 64);
    bytes[64] = 0x1b;
    const base64url = bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    // Wrap with 0x prefix as PhantomClient returns it
    const sig = `0x${base64url}`;

    const result = splitSignature(sig);

    expect(result.r).toBe("0x" + "aa".repeat(32));
    expect(result.s).toBe("0x" + "bb".repeat(32));
    expect(result.v).toBe(27);
  });

  it("throws when base64-decoded bytes are too short", () => {
    const short = Buffer.alloc(10).toString("base64url");
    expect(() => splitSignature(`0x${short}`)).toThrow("Signature too short");
  });
});

// ── nextNonce ────────────────────────────────────────────────────────────────

describe("nextNonce", () => {
  it("returns a positive integer", () => {
    const n = nextNonce();
    expect(Number.isInteger(n)).toBe(true);
    expect(n).toBeGreaterThan(0);
  });

  it("returns strictly increasing values on successive calls", () => {
    const a = nextNonce();
    const b = nextNonce();
    const c = nextNonce();
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
});

// ── formatPrice ──────────────────────────────────────────────────────────────

describe("formatPrice", () => {
  // Hyperliquid rule: decimals = max(0, 6 - szDecimals - floor(log10(price)))

  it("BTC ~$70k (szDecimals=5) → 0 decimal places", () => {
    // 6 - 5 - floor(log10(70000)) = 6 - 5 - 4 = -3 → max(0,-3) = 0
    expect(formatPrice(70000, 5)).toBe("70000");
    expect(formatPrice(77493.9, 5)).toBe("77494");
  });

  it("SOL ~$100 (szDecimals=2) → 2 decimal places", () => {
    // 6 - 2 - floor(log10(100)) = 6 - 2 - 2 = 2
    expect(formatPrice(100.567, 2)).toBe("100.57");
  });

  it("small token ~$0.001 (szDecimals=0) → 8 decimal places", () => {
    // 6 - 0 - floor(log10(0.001)) = 6 - 0 - (-3) = 9 → 9 decimals
    const result = formatPrice(0.001234, 0);
    expect(parseFloat(result)).toBeCloseTo(0.001234, 6);
  });

  it("returns a string", () => {
    expect(typeof formatPrice(50000, 5)).toBe("string");
  });

  it("zero price — epsilon trick prevents -Infinity log; returns many decimal places", () => {
    // log10(0 + 1e-9) = -9 → decimals = max(0, 6 - szDecimals + 9)
    const result = formatPrice(0, 5);
    expect(parseFloat(result)).toBe(0);
    expect(Number.isFinite(parseFloat(result))).toBe(true);
  });

  it("very large price (1e8, szDecimals=5) → 0 decimal places", () => {
    // 6 - 5 - floor(log10(1e8)) = 6 - 5 - 8 = -7 → max(0,-7) = 0
    expect(formatPrice(1e8, 5)).toBe("100000000");
  });

  it("returns a finite string for very small positive price", () => {
    const result = formatPrice(1e-10, 0);
    expect(Number.isFinite(parseFloat(result))).toBe(true);
  });
});

// ── formatSize ───────────────────────────────────────────────────────────────

describe("formatSize", () => {
  it("formats to the given number of decimal places", () => {
    expect(formatSize(1.23456, 3)).toBe("1.235");
    expect(formatSize(0.1, 1)).toBe("0.1");
    expect(formatSize(10, 0)).toBe("10");
  });

  it("zero size returns all-zero string", () => {
    expect(formatSize(0, 5)).toBe("0.00000");
    expect(formatSize(0, 0)).toBe("0");
  });

  it("rounds fractional size to the specified decimal places", () => {
    // 0.123456789 rounded to 5 places → "0.12346"
    expect(formatSize(0.123456789, 5)).toBe("0.12346");
  });

  it("very small size that rounds to zero at given precision", () => {
    // 0.000001 with 5 decimals → "0.00000"
    expect(formatSize(0.000001, 5)).toBe("0.00000");
  });
});

// ── resolveLimitPrice ────────────────────────────────────────────────────────

describe("resolveLimitPrice", () => {
  const SZ_DECIMALS = 5;
  const MARKET_PRICE = 50000;

  describe("market orders", () => {
    it("buy: applies +10% slippage to market price", () => {
      const result = resolveLimitPrice("market", undefined, MARKET_PRICE, true, SZ_DECIMALS);
      expect(result).toBe(formatPrice(MARKET_PRICE * 1.1, SZ_DECIMALS));
    });

    it("sell: applies -10% slippage to market price", () => {
      const result = resolveLimitPrice("market", undefined, MARKET_PRICE, false, SZ_DECIMALS);
      expect(result).toBe(formatPrice(MARKET_PRICE * 0.9, SZ_DECIMALS));
    });

    it("ignores any limitPrice passed for a market order", () => {
      const result = resolveLimitPrice("market", "99999", MARKET_PRICE, true, SZ_DECIMALS);
      expect(result).toBe(formatPrice(MARKET_PRICE * 1.1, SZ_DECIMALS));
    });
  });

  describe("limit orders", () => {
    it("returns formatPrice of the parsed limitPrice", () => {
      const result = resolveLimitPrice("limit", "48000", MARKET_PRICE, true, SZ_DECIMALS);
      expect(result).toBe(formatPrice(48000, SZ_DECIMALS));
    });

    it("throws when limitPrice is absent", () => {
      expect(() => resolveLimitPrice("limit", undefined, MARKET_PRICE, true, SZ_DECIMALS)).toThrow(
        "limitPrice is required for limit orders",
      );
    });

    it("throws when limitPrice is an empty string", () => {
      expect(() => resolveLimitPrice("limit", "", MARKET_PRICE, true, SZ_DECIMALS)).toThrow(
        "limitPrice is required for limit orders",
      );
    });

    it.each([["0"], ["-1000"], ["abc"], ["NaN"], ["Infinity"]])(
      "throws for non-positive or non-finite limitPrice=%j",
      bad => {
        expect(() => resolveLimitPrice("limit", bad, MARKET_PRICE, true, SZ_DECIMALS)).toThrow(
          "limitPrice must be a finite positive number",
        );
      },
    );
  });
});

// ── buildExchangeActionTypedData ─────────────────────────────────────────────

describe("buildExchangeActionTypedData", () => {
  const orderAction: HlOrderAction = {
    type: "order",
    orders: [{ a: 0, b: true, p: "50000", s: "0.001", r: false, t: { limit: { tif: "Ioc" } } }],
    grouping: "na",
  };

  it("uses the Exchange domain (chainId 1337)", () => {
    const td = buildExchangeActionTypedData(orderAction, 1000);
    expect(td.domain.name).toBe("Exchange");
    expect(td.domain.chainId).toBe(1337);
    expect(td.domain.verifyingContract).toBe("0x0000000000000000000000000000000000000000");
  });

  it("uses Agent as primaryType", () => {
    const td = buildExchangeActionTypedData(orderAction, 1000);
    expect(td.primaryType).toBe("Agent");
  });

  it("message.source is 'a' for mainnet", () => {
    const td = buildExchangeActionTypedData(orderAction, 1000, false);
    expect(td.message.source).toBe("a");
  });

  it("message.source is 'b' for testnet", () => {
    const td = buildExchangeActionTypedData(orderAction, 1000, true);
    expect(td.message.source).toBe("b");
  });

  it("message.connectionId is a 0x-prefixed hex string", () => {
    const td = buildExchangeActionTypedData(orderAction, 1000);
    expect(typeof td.message.connectionId).toBe("string");
    expect(td.message.connectionId as string).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("produces a different connectionId for a different nonce", () => {
    const td1 = buildExchangeActionTypedData(orderAction, 1000);
    const td2 = buildExchangeActionTypedData(orderAction, 2000);
    expect(td1.message.connectionId).not.toBe(td2.message.connectionId);
  });

  it("works for CancelAction", () => {
    const cancel: HlCancelAction = { type: "cancel", cancels: [{ a: 1, o: 42 }] };
    const td = buildExchangeActionTypedData(cancel, 1000);
    expect(td.primaryType).toBe("Agent");
  });

  it("works for UpdateLeverageAction", () => {
    const leverage: HlUpdateLeverageAction = { type: "updateLeverage", asset: 0, isCross: true, leverage: 10 };
    const td = buildExchangeActionTypedData(leverage, 1000);
    expect(td.primaryType).toBe("Agent");
  });
});

// ── buildUsdClassTransferTypedData ───────────────────────────────────────────

describe("buildUsdClassTransferTypedData", () => {
  const action: HlUsdClassTransferAction = {
    type: "usdClassTransfer",
    hyperliquidChain: "Mainnet",
    signatureChainId: "0xa4b1",
    amount: "100",
    toPerp: true,
    nonce: 12345,
  };

  it("uses HyperliquidSignTransaction domain and derives chainId from signatureChainId", () => {
    const td = buildUsdClassTransferTypedData(action);
    expect(td.domain.name).toBe("HyperliquidSignTransaction");
    expect(td.domain.chainId).toBe(42161); // 0xa4b1 = 42161
  });

  it("uses chainId 421614 when signatureChainId is testnet (0x66eee)", () => {
    const testnetAction = { ...action, signatureChainId: "0x66eee" as const };
    const td = buildUsdClassTransferTypedData(testnetAction);
    expect(td.domain.chainId).toBe(421614);
  });

  it("primaryType is HyperliquidTransaction:UsdClassTransfer", () => {
    const td = buildUsdClassTransferTypedData(action);
    expect(td.primaryType).toBe("HyperliquidTransaction:UsdClassTransfer");
  });

  it("types include the UsdClassTransfer fields", () => {
    const td = buildUsdClassTransferTypedData(action);
    const fields = td.types["HyperliquidTransaction:UsdClassTransfer"];
    const names = fields.map((f: { name: string }) => f.name);
    expect(names).toContain("hyperliquidChain");
    expect(names).toContain("amount");
    expect(names).toContain("toPerp");
    expect(names).toContain("nonce");
  });

  it("message contains only the USD_CLASS_TRANSFER_TYPE fields", () => {
    const td = buildUsdClassTransferTypedData(action);
    expect(td.message).toEqual({
      hyperliquidChain: "Mainnet",
      amount: "100",
      toPerp: true,
      nonce: 12345,
    });
    expect(td.message).not.toHaveProperty("type");
    expect(td.message).not.toHaveProperty("signatureChainId");
  });
});
