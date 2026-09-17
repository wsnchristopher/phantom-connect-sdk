# Perpetuals (Hyperliquid) — @phantom/cli

The Phantom CLI exposes a full suite of perpetuals commands backed by [Hyperliquid](https://hyperliquid.xyz/). This document covers each command, its options, and common workflows.

When running in MCP server mode (`phantom --mcp`), all commands are exposed as MCP tools under the `perps_` prefix.

## Command Reference

### `phantom perps markets` — MCP: `perps_markets`

List all available perpetual markets on Hyperliquid with current prices, funding rates, open interest, 24h volume, max leverage, and optional `assetId`. Use this to discover tradeable markets and get current prices before opening positions. HIP-3 builder-deployed markets encode the DEX in the `symbol` field using `DEX:SYMBOL` format (e.g. `WOOF:BTC`).

**Options:** none required

---

### `phantom perps account` — MCP: `perps_account`

Get your perpetuals account balance including total account value, available balance, and withdrawable amount. The account is funded with USDC on Hyperliquid. If you trade on HIP-3 builder-deployed DEXs, per-DEX balances are returned in the `dexs` map alongside the main account totals.

**Options:**

- `--walletId` (optional) — wallet ID, defaults to authenticated wallet
- `--derivationIndex` (optional) — derivation index, default 0

---

### `phantom perps positions` — MCP: `perps_positions`

Get your open perpetual positions including entry price, mark price, unrealized PnL, and margin used.

**Options:**

- `--walletId` (optional)
- `--derivationIndex` (optional)

---

### `phantom perps orders` — MCP: `perps_orders`

Get your open perpetual orders (resting limit orders waiting to be filled).

**Options:**

- `--walletId` (optional)
- `--derivationIndex` (optional)

---

### `phantom perps history` — MCP: `perps_history`

Get your perpetual trade history (filled orders).

**Options:**

- `--walletId` (optional)
- `--derivationIndex` (optional)

---

### `phantom perps open` — MCP: `perps_open`

Open a perpetual position on Hyperliquid. Supports market and limit orders in long or short direction. The position size is specified in USD.

**Options:**

- `--market` — market symbol, e.g. `BTC`, `ETH`, `SOL`. For HIP-3 builder-deployed markets use `DEX:SYMBOL` format, e.g. `WOOF:BTC`
- `--direction` — `long` or `short`
- `--sizeUsd` — position size in USD (e.g. `100` for $100 notional)
- `--leverage` — leverage multiplier (e.g. `1` for 1x, `10` for 10x)
- `--orderType` — `market` or `limit`
- `--limitPrice` (required for limit orders) — the limit price
- `--marginType` — `isolated` (default) or `cross`
- `--reduceOnly` (optional) — if set, can only reduce an existing position
- `--walletId` (optional)
- `--derivationIndex` (optional)

**Notes:**

- Run `phantom perps markets` first to verify the market symbol and current price.
- Market orders apply a 10% slippage buffer automatically.
- Requires USDC in the perps account. Use `phantom perps deposit` to bridge tokens from an external chain if needed.

---

### `phantom perps close` — MCP: `perps_close`

Close an open perpetual position. Submits a market order in the opposite direction to fully close the position.

**Options:**

- `--market` — market symbol of the position to close
- `--walletId` (optional)
- `--derivationIndex` (optional)

---

### `phantom perps cancel` — MCP: `perps_cancel`

Cancel an open perpetual order by order ID.

**Options:**

- `--orderId` — the order ID to cancel
- `--market` — market symbol of the order
- `--walletId` (optional)
- `--derivationIndex` (optional)

---

### `phantom perps leverage` — MCP: `perps_leverage`

Update the leverage multiplier for a market without changing any positions.

**Options:**

- `--market` — market symbol
- `--leverage` — new leverage multiplier
- `--marginType` — `isolated` or `cross`
- `--walletId` (optional)
- `--derivationIndex` (optional)

---

### `phantom perps transfer` — MCP: `perps_transfer`

Move USDC from the Hyperliquid spot account into the perpetuals account. This is an internal Hyperliquid transfer — both accounts live on Hypercore (Hyperliquid's chain).

**Options:**

- `--amountUsdc` — amount of USDC to transfer (e.g. `100`)
- `--walletId` (optional)
- `--derivationIndex` (optional)

**Note:** USDC must already be in your Hyperliquid spot account. Use this command when you have USDC in Hyperliquid spot that you want to move into the perps account.

---

### `phantom perps deposit` — MCP: `perps_deposit`

Bridge tokens from an external chain (Solana, Arbitrum, Base, Ethereum, Polygon) into Hyperliquid as USDC via a cross-chain swap. USDC is delivered directly to your Hyperliquid perps account.

**Options:**

- `--sourceChainId` — CAIP-2 source chain ID (e.g. `solana:mainnet`, `eip155:42161` for Arbitrum, `eip155:8453` for Base)
- `--amount` — amount to send in human-readable units (e.g. `100` for 100 USDC)
- `--sellTokenMint` (optional) — token to sell on source chain; defaults to USDC on source chain
- `--sellTokenIsNative` (optional) — set to sell native SOL or ETH
- `--execute` — omit to preview quote only; pass `--execute` to sign and broadcast

---

### `phantom perps withdraw` — MCP: `perps_withdraw`

Bridge USDC from the Hyperliquid perpetuals account to an external chain (Solana, Base, Ethereum, Arbitrum, Polygon) via the Relay bridge.

**Options:**

- `--amountUsdc` — amount of USDC to withdraw (e.g. `50`)
- `--destinationChainId` — CAIP-2 destination chain (e.g. `solana:mainnet`, `eip155:8453` for Base)
- `--buyToken` (optional) — CAIP-19 token to receive; defaults to USDC on destination chain
- `--walletId` (optional)
- `--derivationIndex` (optional)

**Note:** Run `phantom perps account` to check the withdrawable balance before withdrawing.

---

## Common Workflows

### Fund and open a position

```bash
# 1. Bridge USDC from Solana directly into the perps account
phantom perps deposit --sourceChainId solana:mainnet --amount 100 --execute

# 2. Check available markets and current price
phantom perps markets

# 3. Open a long position
phantom perps open --market BTC --direction long --sizeUsd 100 --leverage 5 --orderType market

# 4. Verify the position
phantom perps positions
```

### Close and withdraw

```bash
# 1. Check open positions
phantom perps positions

# 2. Close the position
phantom perps close --market BTC

# 3. Check withdrawable balance
phantom perps account

# 4. Bridge USDC back to Solana
phantom perps withdraw --amountUsdc 100 --destinationChainId solana:mainnet
```

### Place and manage a limit order

```bash
# 1. Place a limit order
phantom perps open --market ETH --direction long --sizeUsd 50 --leverage 3 --orderType limit --limitPrice 3000

# 2. Check the order is on the book
phantom perps orders

# 3. Cancel the order if needed
phantom perps cancel --orderId <orderId> --market ETH
```
