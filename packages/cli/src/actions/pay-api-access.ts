/**
 * pay_api_access tool — signs and broadcasts the unsigned CASH token transfer tx
 * returned in an PaymentRequiredError error, then stores the signature so all
 * subsequent requests are automatically unlocked for the rest of the day.
 */

import { Cli, z } from "incur";
import { AddressType, NetworkId } from "@phantom/client";
import { base64urlEncode } from "@phantom/base64url";
import { Transaction } from "@solana/web3.js";

import { createAction } from "../utils/actions";
import { WalletIdSchema, DerivationIndexSchema, Base64Schema } from "../utils/schemas";
import { runSimulation } from "../utils/simulation";

const COMPUTE_BUDGET_PROGRAM = "ComputeBudget111111111111111111111111111111";
const SPL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const SPL_TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const SYSTEM_PROGRAM = "11111111111111111111111111111111";

const TOKEN_TRANSFER = 3;
const TOKEN_TRANSFER_CHECKED = 12;

// ComputeBudget: only SetComputeUnitLimit (2) and SetComputeUnitPrice (3) are expected in a payment tx.
// Reject RequestUnits (0, deprecated) and RequestHeapFrame (1) which have no place in a token transfer.
const COMPUTE_BUDGET_SET_COMPUTE_UNIT_LIMIT = 2;
const COMPUTE_BUDGET_SET_COMPUTE_UNIT_PRICE = 3;

export const PaymentTransactionSchema = Base64Schema.describe(
  "Base64-encoded unsigned Solana transaction from the PaymentRequiredError error response",
)
  .superRefine((b64Tx, ctx) => {
    const txBytes = Buffer.from(b64Tx, "base64");

    let transaction: Transaction;
    try {
      transaction = Transaction.from(txBytes);
    } catch (err) {
      ctx.addIssue({
        code: "custom",
        message: `Payment transaction is not a valid Solana transaction: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

    let tokenTransferCount = 0;

    for (const instruction of transaction.instructions) {
      const program = instruction.programId.toBase58();

      // Forbid system program (native SOL).
      if (program === SYSTEM_PROGRAM) {
        ctx.addIssue({
          code: "custom",
          message:
            "Payment transaction must not contain SOL transfers or system instructions (native SOL payment is forbidden).",
        });
        return;
      }

      // Allow ComputeBudget priority-fee instructions only (SetComputeUnitLimit=2, SetComputeUnitPrice=3).
      if (program === COMPUTE_BUDGET_PROGRAM) {
        const discriminant = instruction.data[0];
        if (
          discriminant !== COMPUTE_BUDGET_SET_COMPUTE_UNIT_LIMIT &&
          discriminant !== COMPUTE_BUDGET_SET_COMPUTE_UNIT_PRICE
        ) {
          ctx.addIssue({
            code: "custom",
            message:
              `Payment transaction contains an unexpected ComputeBudget instruction (type ${discriminant}). ` +
              "Only SetComputeUnitLimit (2) and SetComputeUnitPrice (3) are permitted.",
          });
          return;
        }
        continue;
      }

      // Allow only SPL token transfers for payment (CASH or other SPL tokens).
      if (program === SPL_TOKEN_PROGRAM || program === SPL_TOKEN_2022_PROGRAM) {
        const discriminant = instruction.data[0];

        if (discriminant !== TOKEN_TRANSFER && discriminant !== TOKEN_TRANSFER_CHECKED) {
          ctx.addIssue({
            code: "custom",
            message:
              `Payment transaction contains an unexpected SPL token instruction (type ${discriminant}). ` +
              "Only Transfer (3) and TransferChecked (12) are permitted.",
          });
          return;
        }

        tokenTransferCount++;
        continue;
      }

      ctx.addIssue({
        code: "custom",
        message: `Payment transaction contains an unexpected program: ${program}`,
      });
      return;
    }

    if (tokenTransferCount === 0) {
      ctx.addIssue({
        code: "custom",
        message:
          "Payment transaction must contain at least one SPL token transfer instruction (to pay for API access with tokens).",
      });
    }
  })
  .describe("Validates that the transaction is a valid payment transaction for API access");

const PayApiAccessSchema = z.object({
  preparedTx: PaymentTransactionSchema,
  walletId: WalletIdSchema.describe("Optional wallet ID (defaults to authenticated wallet)"),
  derivationIndex: DerivationIndexSchema.describe("Optional derivation index (default: 0)"),
});

const PayApiAccessOutputSchema = z.object({
  success: z.literal(true),
  signature: z.string(),
  message: z.string(),
});

const payApiAccessAction = createAction({
  description:
    "Phantom Wallet — Pays for daily API access by signing and broadcasting the CASH token transfer " +
    "transaction included in an PaymentRequiredError error response. " +
    "Call this when any tool returns error code PaymentRequiredError, passing the preparedTx from that response. " +
    "On success, the payment signature is stored and API calls are unlocked until the purchased quota is consumed. " +
    "After calling this, retry the original tool that triggered the payment requirement.",
  options: PayApiAccessSchema,
  output: PayApiAccessOutputSchema,
  mcp: {
    command: "pay_api_access",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    },
  },
  run: async ({ options: params, var: context }) => {
    const { apiClient } = context;
    const client = context.manager.getClient();
    const session = context.manager.getSession();

    const walletId = params.walletId ?? session.walletId;
    const derivationIndex = params.derivationIndex;

    const addresses = await client.getWalletAddresses(walletId, undefined, derivationIndex);
    const solanaAddress = addresses.find(a => a.addressType === AddressType.solana)?.address;
    if (!solanaAddress) throw new Error("No Solana address found for this wallet");

    const simulation = await runSimulation(
      {
        type: "transaction",
        chainId: NetworkId.SOLANA_MAINNET,
        userAccount: solanaAddress,
        params: { transactions: [params.preparedTx], method: "signAndSendTransaction" },
      },
      context,
    );

    if (simulation.block) {
      throw new Error(`Payment transaction blocked by simulation: ${simulation.block.message}`);
    }

    const txBytes = Buffer.from(params.preparedTx, "base64");
    const result = await client.signAndSendTransaction({
      walletId,
      transaction: base64urlEncode(txBytes),
      networkId: NetworkId.SOLANA_MAINNET,
      account: solanaAddress,
      derivationIndex,
    });

    if (!result.hash) throw new Error("Transaction submitted but no signature returned");

    // Store the signature — included as X-Payment on all subsequent requests
    apiClient.setPaymentSignature(result.hash);

    return {
      success: true as const,
      signature: result.hash,
      message:
        "API quota refreshed. Retry the original action now. You may need to pay again if you hit the quota limit.",
    };
  },
});

export const payCommand = Cli.create("pay", payApiAccessAction.command);
export const payApiAccessTool = payApiAccessAction.tool;
