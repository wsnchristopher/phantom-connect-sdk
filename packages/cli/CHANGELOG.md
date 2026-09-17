# @phantom/cli

## 2.0.1

### Patch Changes

- e8e6dfe: Preserve KMS transaction submission errors without resetting valid sessions, and refresh expired authentication before re-authenticating.

## 2.0.0

### Major Changes

- b9e1497: Remove the `rpcUrl` CLI/MCP input from `@phantom/cli` actions that perform
  on-chain reads. This is a breaking change for scripts or agents that pass
  `rpcUrl`; RPC requests now use the SDK's configured default endpoints for the
  selected network.

### Patch Changes

- 86997b0: Fix device-code session creation after consent, and include HTTP status, service error text, and request ID in provisioning failures.
- fcf368b: validate perp responses
- Updated dependencies [86997b0]
- Updated dependencies [65140f4]
- Updated dependencies [fcf368b]
- Updated dependencies [fce0979]
  - @phantom/auth2@2.0.3
  - @phantom/client@2.0.3
  - @phantom/perps-client@1.2.2
  - @phantom/constants@2.0.3
  - @phantom/base64url@2.0.3
  - @phantom/sdk-types@2.0.3
  - @phantom/parsers@2.0.3
  - @phantom/crypto@2.0.3
  - @phantom/api-key-stamper@2.0.3
  - @phantom/utils@2.0.3

## 1.2.6

### Patch Changes

- 1e542fb: upgrade packages, improving commands
- Updated dependencies [1e542fb]
  - @phantom/api-key-stamper@2.0.2
  - @phantom/auth2@2.0.2
  - @phantom/base64url@2.0.2
  - @phantom/client@2.0.2
  - @phantom/constants@2.0.2
  - @phantom/crypto@2.0.2
  - @phantom/parsers@2.0.2
  - @phantom/perps-client@1.2.1
  - @phantom/phantom-api-client@1.2.1
  - @phantom/sdk-types@2.0.2
  - @phantom/utils@2.0.2

## 1.1.0

### Minor Changes

- ab708eb: Updated to use CLI

### Patch Changes

- Updated dependencies [ab708eb]
  - @phantom/perps-client@1.2.0
  - @phantom/phantom-api-client@1.2.0
