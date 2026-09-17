/**
 * Reusable Zod schemas for action output types.
 *
 * Import these at the call site instead of defining inline schemas for shapes
 * that appear in multiple actions.
 */

import { z } from "incur";
import { ScannedResultSchema } from "./simulation";

/**
 * The "preview" leg of two-step transaction flows — returned when `confirmed` is
 * false/omitted so the agent can show the user what will happen before executing.
 */
export const PendingConfirmationSchema = z.object({
  status: z.literal("pending_confirmation"),
  simulation: ScannedResultSchema.nullable(),
});

/**
 * Single signature returned by all message-signing actions.
 */
export const SignatureOutputSchema = z.object({
  signature: z.string(),
});

/**
 * Output from buy_token and deposit_to_hyperliquid.
 * `execution` is present only when `execute: true` was passed.
 */
export const BuyTokenOutputSchema = z.object({
  quoteRequest: z.record(z.string(), z.unknown()),
  quoteResponse: z.object({
    quotes: z.array(z.record(z.string(), z.unknown())),
  }),
  execution: z
    .object({
      signature: z.string().nullable(),
      rawTransaction: z.string(),
      explorerUrl: z.string().nullable(),
    })
    .optional(),
});
