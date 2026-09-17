# @phantom/openclaw-plugin

## 1.2.8

### Patch Changes

- fcf368b: validate perp responses
- Updated dependencies [86997b0]
- Updated dependencies [65140f4]
- Updated dependencies [fcf368b]
- Updated dependencies [fce0979]
- Updated dependencies [b9e1497]
  - @phantom/cli@2.0.0
  - @phantom/client@2.0.3

## 1.2.6

### Patch Changes

- 1e542fb: upgrade packages, improving commands
- Updated dependencies [1e542fb]
  - @phantom/cli@1.2.6
  - @phantom/phantom-api-client@1.2.1

## 1.2.0

### Minor Changes

- ab708eb: Updated to use CLI

### Patch Changes

- Updated dependencies [ab708eb]
  - @phantom/cli@1.1.0
  - @phantom/phantom-api-client@1.2.0

## 1.0.0-beta.0

### Major Changes

- aa1450d: Auth 2.0 and DCR flow enabled

### Patch Changes

- Updated dependencies [aa1450d]
  - @phantom/mcp-server@1.0.0-beta.0
  - @phantom/phantom-api-client@1.0.0-beta.0

## 0.2.4

### Patch Changes

- 04a0319: Fix dependencies
- Updated dependencies [04a0319]
  - @phantom/mcp-server@0.2.4
  - @phantom/phantom-api-client@0.1.2

## 0.2.3

### Patch Changes

- Phantom API Client
- 00da963: Update default api endpoint
- Updated dependencies
- Updated dependencies [00da963]
  - @phantom/phantom-api-client@0.1.1
  - @phantom/mcp-server@0.2.3

## 0.2.2

### Patch Changes

- 92e3472: Perps Support
- Updated dependencies [92e3472]
  - @phantom/mcp-server@0.2.2

## 0.2.1

### Patch Changes

- 6ba2806: Fix add phantom_login
- Updated dependencies [6ba2806]
  - @phantom/mcp-server@0.2.1

## 0.2.0

### Minor Changes

- e5401de: Updated MCP interfaces to support EVM transactions, added balance fetching.

### Patch Changes

- 3b452b7: Updated descriptions and added new get balances method. Fixed openclaw plugin identifier
- Updated dependencies [3b452b7]
- Updated dependencies [e5401de]
  - @phantom/mcp-server@0.2.0

## 0.1.8

### Patch Changes

- 9007383: Fix derivation index handling in MCP tools by accepting numeric strings (for example, `"0"`) and coercing them to numbers before validation.

  Improve `buy_token` 405 errors with explicit guidance when `quoteApiUrl` points to a non-Phantom-compatible endpoint.

  Add guardrails in OpenClaw wallet docs/skill to keep `quoteApiUrl` unset by default and only override for explicit debugging.

- Updated dependencies [9007383]
  - @phantom/mcp-server@0.1.8

## 0.1.7

### Patch Changes

- Fix OpenClaw tool schema registration to preserve MCP parameter typing and enum constraints so agents generate valid tool calls.

  Improve `buy_token` agent-facing descriptions and wallet skill docs to clarify swap-intent vs buy-intent usage (`exactOut`) and route/landing reliability guidance.

  Add regression tests for OpenClaw schema conversion to prevent future loss of required fields, enum constraints, and typed parameter validation.

- Updated dependencies
  - @phantom/mcp-server@0.1.7

## 0.1.6

### Patch Changes

- 26d1963: Fix numeric amount validation edge cases in MCP server
  - `parseBaseUnitAmount`: reject numbers above `Number.MAX_SAFE_INTEGER` to prevent silent precision loss; callers should pass strings for large base unit amounts
  - `parseUiAmount`: handle exponential notation (e.g., `1e-7`) by using `toFixed(decimals)` instead of `String()`, which previously produced strings like `"1e-7"` that failed regex validation

- Updated dependencies [26d1963]
  - @phantom/mcp-server@0.1.5

## 0.1.5

### Patch Changes

- Align swap quote requests with Terminal client-auth behavior by adding Phantom client auth headers (`X-PhantomAuthToken`, `X-PhantomNonce`) and standard Phantom platform/version headers to `buy_token`.

  Keep compatibility headers (`x-api-key`, `X-App-Id`) in quote requests and add test coverage for deterministic client-auth header generation.

- Updated dependencies
  - @phantom/mcp-server@0.1.4

## 0.1.4

### Patch Changes

- 2977094: Fix OpenClaw startup failures caused by unwanted DCR registration.
  - `@phantom/openclaw-plugin`: correctly reads plugin-scoped config from full OpenClaw `api.config` payload and fails fast with a clear error when `PHANTOM_APP_ID` is missing.
  - `@phantom/mcp-server`: uses constructor `appId` as `client_id` when it is a pre-registered UUID, avoiding DCR for configured apps.

- Updated dependencies [2977094]
  - @phantom/mcp-server@0.1.3

## 0.1.3

### Patch Changes

- Add the required `configSchema` to the OpenClaw plugin manifest so plugin installation no longer fails OpenClaw config validation.

## 0.1.2

### Patch Changes

- Fix OpenClaw config handling so plugin-provided Phantom auth settings are applied to environment variables before session initialization, preventing incorrect fallback to OAuth dynamic client registration.

## 0.1.1

### Patch Changes

- 148e8e3: Improve documentation for MCP server and OpenClaw plugin:
  - Add comprehensive Quick Start guide with installation checklist
  - Add Network IDs Reference section with CAIP-2/CAIP-10 format examples
  - Add complete documentation for all 5 tools (transfer_tokens and buy_token now fully documented)
  - Add safety considerations and confirmation requirements for financial operations
  - Fix incorrect Solana devnet network identifier
  - Add redirect URL configuration instructions for Phantom Portal setup
- Updated dependencies [148e8e3]
- Updated dependencies [132b012]
- Updated dependencies [d769c51]
  - @phantom/mcp-server@0.1.1

## 0.1.0

### Major Changes

- **Renamed from openclaw-mcp to phantom-openclaw-plugin** - Better alignment with Phantom branding and OpenClaw plugin conventions
- **Direct integration with @phantom/mcp-server** - No longer uses a generic MCP bridge; instead directly depends on and integrates the Phantom MCP Server
- **Automatic session management** - Handles OAuth authentication and session persistence automatically
- **Modular architecture**:
  - `src/session.ts` - Wraps SessionManager for authentication lifecycle
  - `src/tools/` - Registers Phantom MCP tools directly as OpenClaw tools
  - `src/client/` - OpenClaw API type definitions
  - `skills/` - User-facing workflow skills
- **Added comprehensive README** - Installation, configuration, usage examples, and troubleshooting
- **Added phantom-wallet skill** - Pre-built workflow for common wallet operations
- **Improved type safety** - Full TypeScript support with proper type definitions
- **Updated package metadata** - New package name `@phantom/openclaw-plugin`

### Features

- Direct integration with `@phantom/mcp-server` for reliable wallet operations
- Automatic OAuth flow and session management on first use
- Native Phantom MCP tools exposed as OpenClaw tools
- Type-safe parameter validation with TypeBox
- Automatic result transformation to OpenClaw format
- Zero configuration required

### Available Tools

- `get_wallet_addresses` - Retrieve wallet addresses for all supported chains
- `sign_message` - Sign arbitrary messages
- `sign_transaction` - Sign blockchain transactions
- `transfer_tokens` - Transfer tokens to addresses
- `buy_token` - Purchase tokens
