---
name: new-cli-action
description: Scaffold a new CLI action for this SDK repository. Use when the user asks to add a new command, tool, or action to the Phantom CLI/MCP. Guides through creating the action file, registering the command in the appropriate CLI group, and adding the tool to the OpenClaw registry.
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Agent
---

# /new-cli-action — Scaffold a New CLI Action

Arguments passed: `$ARGUMENTS`

You are helping the user add a new command to the Phantom CLI (`packages/cli`). Every action is automatically exposed in three places: the CLI binary, the MCP server, and OpenClaw. All three come for free from a single `createAction` call — the user only needs to write one file and make two registration edits.

> **Framework:** The CLI is built on [incur](https://github.com/wevm/incur), a TypeScript framework for building CLIs that work as both binaries and MCP servers. The `Cli` and `z` imports in every action file come from `incur`. If you need deeper guidance on incur patterns — schemas, Cli APIs, or advanced usage — run `npx incur skills add` in the project root to pull the official incur skill into Claude Code and piggyback off it.

---

## Step 1 — Understand the requirement

If `$ARGUMENTS` is empty or vague, ask the user:

1. What should the command do? (one sentence)
2. What inputs does it need?
3. What does a success response look like?
4. Where should it live in the CLI? (top-level like `phantom buy`, or under a sub-group like `phantom perps open`)

If `$ARGUMENTS` describes the command well enough, proceed directly.

---

## Step 2 — Determine the file location and CLI group

The CLI is structured as follows. Read `packages/cli/src/index.ts` and the relevant command file to confirm the current shape before writing anything.

| CLI path               | Command file                         | Action files            |
| ---------------------- | ------------------------------------ | ----------------------- |
| `phantom <cmd>`        | `src/index.ts` (registered directly) | `src/actions/<name>.ts` |
| `phantom wallet <cmd>` | `src/commands/wallet.ts`             | `src/actions/<name>.ts` |
| `phantom solana <cmd>` | `src/commands/solana.ts`             | `src/actions/<name>.ts` |
| `phantom evm <cmd>`    | `src/commands/evm.ts`                | `src/actions/<name>.ts` |
| `phantom perps <cmd>`  | `src/commands/perps.ts`              | `src/actions/<name>.ts` |
| `phantom token <cmd>`  | `src/commands/token.ts`              | `src/actions/<name>.ts` |

If the command belongs to a **new group** that doesn't have a command file yet, create `src/commands/<group>.ts` following the pattern of an existing one (e.g. `wallet.ts`), then register `<group>Cli` in `src/index.ts`.

Decide the kebab-case filename: `src/actions/<verb>-<noun>.ts` (e.g. `get-perp-account.ts`, `send-evm-transaction.ts`).

---

## Step 3 — Write the action file

Create `packages/cli/src/actions/<name>.ts` using the template below. Fill every section — do not leave TODOs or placeholders.

```typescript
/**
 * <mcp_command_name> tool
 *
 * <One or two sentences describing what this action does and any important
 * preconditions (e.g. "Wallet must hold USDC in the perps account").>
 */

import { Cli, z } from "incur";
import { createAction } from "../utils/actions.js";
// Import helpers as needed:
//   Session/wallet:  import { WalletIdSchema, DerivationIndexSchema } from "../utils/schemas.js";
//   Solana address:  import { getSolanaAddress } from "../utils/solana.js";
//   EVM address:     import { getEthereumAddress } from "../utils/evm.js";
//   Perps client:    import { createPerpsClient } from "../utils/perps.js";
//   Shared schemas:  import { ActionResponseSchema, PendingConfirmationSchema } from "../utils/output-schemas.js";

const <PascalName>Schema = z.object({
  // Each field needs a .describe() explaining its purpose and any defaults.
  // Always include these at the bottom if the action touches the wallet:
  // walletId: WalletIdSchema.describe("Optional wallet ID (defaults to authenticated wallet)"),
  // derivationIndex: DerivationIndexSchema.describe("Optional derivation index (default: 0)"),
});

const <PascalName>OutputSchema = z.object({
  // Define every field the run() function returns.
  // Use z.string().nullable() when a field can be null.
  // Use .optional() for fields that are sometimes absent.
});

const <camelName>Action = createAction({
  // description: Shown to the LLM agent. Should be detailed enough that the
  // agent knows when and how to use this tool. Include:
  //   - What it does
  //   - Any required preconditions
  //   - What the success response looks like
  //   - Any important defaults or two-step flow notes
  description:
    "Phantom Wallet — <detailed description>.",
  options: <PascalName>Schema,
  output: <PascalName>OutputSchema,
  mcp: {
    // command: The MCP/RPC method name. Use snake_case. Should be more
    // descriptive than the CLI sub-command name because MCP tools are flat
    // (no nesting), e.g. "get_perp_account" not just "account".
    command: "<snake_case_mcp_name>",
    annotations: {
      // readOnlyHint: true  → no side effects (reads only)
      // readOnlyHint: false → has side effects (writes, transactions)
      readOnlyHint: <true|false>,
      // destructiveHint: true → irreversible (sends tx, deletes data)
      destructiveHint: <true|false>,
      // openWorldHint: true → makes network/external calls
      openWorldHint: <true|false>,
    },
  },
  run: async ({ options: params, var: context }) => {
    const { logger } = context;
    const session = context.manager.getSession();

    // context.manager.getClient() → PhantomClient (sign, send, addresses)
    // context.apiClient           → PhantomApiClient (REST endpoints)
    // session.walletId            → currently authenticated wallet ID
    // session.organizationId      → org ID for the current session

    // A session is automatically initialized on first use and persisted
    // across calls — no manual session management required.

    // ... implementation ...

    return { /* must match <PascalName>OutputSchema */ };
  },
});

export const <camelName>Command = Cli.create("<cli-subcommand>", <camelName>Action.command);
export const <camelName>Tool = <camelName>Action.tool;
```

### Key rules when filling out the template

- **Input schema first, output schema second** — the input schema is defined above the output schema in every action file.
- **`description` on every input field** — each `z.*` field must have `.describe(...)`. Include the default value in the description text if one exists (e.g. `"Default: false."`).
- **No `output: z.any()`** — always define a concrete output schema.
- **`mcp.command` vs CLI sub-command** — the MCP command name is flat and globally unique (`get_perp_account`); the CLI sub-command is the leaf word under its group (`account` under `phantom perps`).
- **`readOnlyHint: true`** only for pure reads with no side effects.
- **Shared output schemas** — if the output shape is also used by another action, add it to `src/utils/output-schemas.ts` and import it. Otherwise define it inline.
- **`ActionResponseSchema`** — use for any Hyperliquid write operation that returns `{ status, data? }`.
- **`PendingConfirmationSchema`** — use in a union for two-step flows (simulate first, then confirm).

---

## Step 4 — Register the CLI command

Open the relevant command file and add one import + one `.<command>()` call.

**Example — adding to `perps`:**

```typescript
// In src/commands/perps.ts
import { <camelName>Command } from "../actions/<name>.js";
// ...
perpsCli.command(<camelName>Command);
```

**Example — adding top-level to `src/index.ts`:**

```typescript
import { <camelName>Command } from "./actions/<name>.js";
// ...
cli.command(<camelName>Command);
```

---

## Step 5 — Register the MCP tool for OpenClaw

Open `src/tools/index.ts`, add the import, and add the tool to the `tools` array in the appropriate section:

```typescript
import { <camelName>Tool } from "../actions/<name>.js";

export const tools: ToolHandler[] = [
  // ... existing tools ...
  <camelName>Tool,   // add in the logical group (wallet / solana / evm / perps read / perps write)
];
```

---

## Step 6 — Verify

Run the TypeScript check to confirm zero errors:

```bash
cd packages/cli && npx tsc --noEmit
```

If there are type errors, fix them before reporting the work as done. Common issues:

- Return type of `run()` doesn't match `<PascalName>OutputSchema` — check every return path.
- `z.string().nullable()` needed where the value can be `null`.
- Missing `as const` on literal returns inside discriminated unions.

---

## Step 7 — Update documentation

Four places need updating. Do all four before reporting done.

### 1. `packages/cli/src/index.ts` — MCP_INSTRUCTIONS

Add the new tool to the `Available tools:` sentence in `MCP_INSTRUCTIONS`:

```typescript
"<mcp_command> (<one-line description>), " +
```

### 2. `packages/cli/README.md`

- **Commands section**: Add the CLI command under the appropriate group heading (or add a new heading for a new group).
- **MCP Tools table**: Add a row `| \`<mcp_name>\` | <description> |` in the logical group.

### 3. `packages/mcp-server/README.md`

Add a row to the relevant tools table (or a new table + heading for a new category):

```markdown
| `<mcp_name>` | <One-sentence description.> |
```

### 4. `packages/phantom-openclaw-plugin/README.md`

Add a full tool entry in the **Available Tools** section following the existing pattern:

```markdown
### `<mcp_name>`

<Two-sentence description: what it does and when to use it.>

**Parameters:**

- `<param>` (<type>, required/optional): <description>

**Example:**

\`\`\`json
{ "<param>": "<value>" }
\`\`\`

**Response:** `{ <key fields> }`
```

---

## Reference: context object

```typescript
context.logger; // Logger — .info(), .warn(), .error(), .debug()
context.apiClient; // PhantomApiClient — Phantom REST endpoints
context.manager.getClient(); // PhantomClient — KMS signing, wallet ops
context.manager.getSession(); // { walletId, organizationId }
context.manager.isInitialized(); // boolean — false if not yet authed
```

A session is initialized on first use (triggering the browser auth flow) and persisted automatically. The `createAction` wrapper handles `AUTH_EXPIRED` by resetting the session and surfacing a clear error — no manual handling needed.

---

## Reference: commonly used helpers

| Helper                                                   | Import path              | When to use                         |
| -------------------------------------------------------- | ------------------------ | ----------------------------------- |
| `getSolanaAddress(context, walletId, derivationIndex)`   | `../utils/solana.js`     | Derive Solana public key            |
| `getEthereumAddress(context, walletId, derivationIndex)` | `../utils/evm.js`        | Derive EVM address                  |
| `createPerpsClient(context, walletId, derivationIndex?)` | `../utils/perps.js`      | All Hyperliquid perps ops           |
| `normalizeNetworkId(id)`                                 | `../utils/network.js`    | Normalise CAIP-2 chain IDs          |
| `parseBaseUnitAmount(amount)`                            | `../utils/amount.js`     | String/number → `bigint` base units |
| `parseUiAmount(amount, decimals)`                        | `../utils/amount.js`     | UI units → `bigint` base units      |
| `runSimulation(body, context)`                           | `../utils/simulation.js` | Simulate before submitting          |
| `WalletIdSchema`                                         | `../utils/schemas.js`    | Optional wallet ID input field      |
| `DerivationIndexSchema`                                  | `../utils/schemas.js`    | Optional HD index input field       |
| `Caip2ChainIdSchema`                                     | `../utils/schemas.js`    | CAIP-2 chain ID input field         |
