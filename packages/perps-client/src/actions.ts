/**
 * EIP-712 typed data builders for Hyperliquid exchange actions.
 *
 * Mirrors wallet2/wallet/packages/perps/src/sdk/orders/action.ts
 */

import { encode } from "@msgpack/msgpack";
import { keccak256 } from "js-sha3";
import type {
  Eip712TypedData,
  HlAction,
  HlOrderAction,
  HlCancelAction,
  HlUpdateLeverageAction,
  HlUsdClassTransferAction,
} from "./schemas";
import {
  HYPERLIQUID_EXCHANGE_DOMAIN,
  HYPERLIQUID_SIGN_TRANSACTION_DOMAIN,
  EIP712_DOMAIN_TYPE,
  APPROVE_EXCHANGE_TYPE,
  USD_CLASS_TRANSFER_TYPE,
  HYPERLIQUID_MAINNET_CHAIN_ID,
  MARKET_ORDER_SLIPPAGE,
} from "./constants";

/**
 * Computes the connectionId hash for exchange actions (orders, cancel, leverage).
 * Mirrors OrderAction.hash(), CancelOrderAction.hash(), UpdateLeverageAction.hash()
 */
function hashAction(action: HlOrderAction | HlCancelAction | HlUpdateLeverageAction, nonce: number): string {
  const msgPackBytes = encode(action);
  // vaultAddress === null: 9 extra bytes (8 for nonce uint64 + 1 for null indicator)
  const data = new Uint8Array(msgPackBytes.length + 9);
  data.set(msgPackBytes);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  view.setBigUint64(msgPackBytes.length, BigInt(nonce));
  view.setUint8(msgPackBytes.length + 8, 0); // vaultAddress === null
  return `0x${keccak256(data)}`;
}

/**
 * Builds EIP-712 typed data for order/cancel/leverage exchange actions.
 * These use the "Agent" signing pattern with a msgpack+keccak256 connectionId.
 */
export function buildExchangeActionTypedData(
  action: HlOrderAction | HlCancelAction | HlUpdateLeverageAction,
  nonce: number,
  isTestnet = false,
): Eip712TypedData {
  const connectionId = hashAction(action, nonce);
  return {
    domain: HYPERLIQUID_EXCHANGE_DOMAIN,
    primaryType: "Agent",
    types: {
      EIP712Domain: EIP712_DOMAIN_TYPE,
      Agent: APPROVE_EXCHANGE_TYPE,
    },
    message: {
      source: isTestnet ? "b" : "a",
      connectionId,
    },
  };
}

/**
 * Builds EIP-712 typed data for UsdClassTransfer (deposit spot→perp or withdraw perp→spot).
 * chainId is derived from action.signatureChainId (hex string) with a fallback to mainnet.
 */
export function buildUsdClassTransferTypedData(action: HlUsdClassTransferAction): Eip712TypedData {
  const chainId = action.signatureChainId ? parseInt(action.signatureChainId, 16) : HYPERLIQUID_MAINNET_CHAIN_ID;
  return {
    domain: {
      ...HYPERLIQUID_SIGN_TRANSACTION_DOMAIN,
      chainId,
    },
    primaryType: "HyperliquidTransaction:UsdClassTransfer",
    types: {
      EIP712Domain: EIP712_DOMAIN_TYPE,
      "HyperliquidTransaction:UsdClassTransfer": USD_CLASS_TRANSFER_TYPE,
    },
    message: {
      hyperliquidChain: action.hyperliquidChain,
      amount: action.amount,
      toPerp: action.toPerp,
      nonce: action.nonce,
    },
  };
}

/** Monotonically increasing nonce (uses current timestamp, falls back to lastNonce+1) */
let lastNonce = 0;
export function nextNonce(): number {
  const now = Date.now();
  lastNonce = now > lastNonce ? now : lastNonce + 1;
  return lastNonce;
}

/**
 * Split a 65-byte signature into r, s, v components.
 *
 * PhantomClient.ethereumSignTypedData() returns a base64url-encoded signature
 * (the KMS API comment says "Return the base64 encoded signature").
 * We decode it to raw bytes then extract r (bytes 0-31), s (bytes 32-63), v (byte 64).
 *
 * Also handles legacy 0x-prefixed hex strings (0x + 130 hex chars) for compatibility.
 */
export function splitSignature(signature: string): { r: string; s: string; v: number } {
  const raw = signature.startsWith("0x") ? signature.slice(2) : signature;

  // Standard hex format: exactly 130 hex chars (65 bytes)
  if (raw.length === 130 && /^[0-9a-fA-F]+$/.test(raw)) {
    return {
      r: `0x${raw.slice(0, 64)}`,
      s: `0x${raw.slice(64, 128)}`,
      v: parseInt(raw.slice(128, 130), 16),
    };
  }

  // Base64url format (KMS response) — decode to bytes then extract components
  const standardBase64 = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padded = standardBase64 + "=".repeat((4 - (standardBase64.length % 4)) % 4);
  const bytes = Buffer.from(padded, "base64");

  if (bytes.length < 65) {
    throw new Error(`Signature too short after base64 decode: expected 65 bytes, got ${bytes.length} (raw="${raw}")`);
  }

  return {
    r: "0x" + bytes.slice(0, 32).toString("hex"),
    s: "0x" + bytes.slice(32, 64).toString("hex"),
    v: bytes[64],
  };
}

/**
 * Formats a price to the required decimal precision for Hyperliquid.
 * Uses at most 5 significant figures.
 */
export function formatPrice(price: number, szDecimals: number): string {
  // Hyperliquid tick size rule: price decimals = max(0, 6 - szDecimals - floor(log10(price)))
  const decimals = Math.max(0, 6 - szDecimals - Math.floor(Math.log10(Math.abs(price) + 1e-9)));
  return price.toFixed(decimals);
}

/**
 * Formats a size to the required decimal precision for Hyperliquid.
 */
export function formatSize(size: number, szDecimals: number): string {
  return size.toFixed(szDecimals);
}

/**
 * Resolves the limit price string to submit to Hyperliquid.
 *
 * - "limit" orders: validates limitPrice is present and a finite positive number,
 *   then formats it with the market's szDecimals.
 * - "market" orders: applies MARKET_ORDER_SLIPPAGE to the current market price.
 *
 * Throws a descriptive error when a limit order is requested without a valid limitPrice.
 */
export function resolveLimitPrice(
  orderType: "market" | "limit",
  limitPrice: string | undefined,
  marketPrice: number,
  isBuy: boolean,
  szDecimals: number,
): string {
  if (orderType === "limit") {
    if (!limitPrice) {
      throw new Error("limitPrice is required for limit orders");
    }
    const parsed = parseFloat(limitPrice);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(`limitPrice must be a finite positive number, got: ${limitPrice}`);
    }
    return formatPrice(parsed, szDecimals);
  }
  return formatPrice(marketPrice * (isBuy ? 1 + MARKET_ORDER_SLIPPAGE : 1 - MARKET_ORDER_SLIPPAGE), szDecimals);
}

export type { HlAction };
