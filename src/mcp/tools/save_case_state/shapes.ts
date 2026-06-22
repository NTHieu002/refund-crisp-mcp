/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { z } from "zod";
import type { ZodRawShape } from "zod";

import { CASE_RECORD_SHAPE } from "@/mcp/tools/_shared/case_shape.js";

/**************************************************************************
 * CONSTANTS
 ***************************************************************************/

// Canonical case-progress stages, ordered roughly by lifecycle. Used to build
// the `stage` field's guidance. NOTE: `stage` is stored as free text (see below)
// so an unexpected value never rejects a save — these are the preferred labels.
const STAGE_VALUES = [
  "collecting_info",          // gathering store_url / invoice / reason / bank
  "winback_offered",          // win-back pitched, awaiting decision
  "offer_sent",               // an offer (win-back / discount / option) was sent
  "bill_sent",                // refund breakdown / bill sent to the customer
  "awaiting_customer_confirm", // amount quoted, waiting for the customer to confirm
  "awaiting_option_choice",   // TH4 Option A/B (or App Credit) presented
  "awaiting_bill_paid",       // TH4 Option B / failed bill — waiting for Paid
  "awaiting_manager",         // escalated to Manager (Boo), awaiting approval
  "forwarded_to_human",       // handed off to a human agent
  "refund_approved",          // customer (and Manager, if needed) approved
  "refund_issued",            // refund processed in Shopify
  "completed",                // case closed (refunded / declined / app credit)
  "rejected",                 // Manager rejected
  "abandoned",                // customer disappeared
] as const;

const MANAGER_STATUS_VALUES = [
  "not_required",
  "pending",
  "approved",
  "rejected",
  "approved_with_changes",
] as const;

const CASE_TYPE_VALUES = ["TH1", "TH2", "TH3", "TH4", "TH5", "TH6", "TH7", "TH8"] as const;

/**************************************************************************
 * INPUT
 ***************************************************************************/

// Every field except store_url is optional: this is a partial upsert.
const SAVE_CASE_STATE_INPUT_SHAPE = {
  store_url : z.string().describe("Shopify store URL. Acts as the primary key for the case."),

  // Identity
  customer_name         : z.string().optional(),
  customer_email        : z.email().optional(),
  // Resolved server-side from the signed Crisp request header, so it is NOT
  // required here and is intentionally unvalidated — a hallucinated value must
  // never reject the whole save. The header value always wins over this field.
  crisp_conversation_id : z
    .string()
    .optional()
    .describe(
      "Deprecated / ignored: the server derives the Crisp session id from the " +
      "request header. You do not need to pass this.",
    ),
  assigned_agent        : z.string().optional().describe("Agent name currently handling the case"),

  // Classification
  case_type         : z.enum(CASE_TYPE_VALUES).optional(),
  // Stored as free text — NOT a strict enum — so a hallucinated/unexpected stage
  // can never reject the whole save (same defensive choice as crisp_conversation_id).
  // SAVE AFTER EVERY STEP, passing the stage that matches what just happened.
  stage             : z
    .string()
    .optional()
    .describe(
      "Case progress stage — call save_case_state after EVERY handling step and pass " +
      "the matching stage. Prefer one of: " + STAGE_VALUES.join(" | ") + ". " +
      "Any other string is still accepted (it will never fail the save), but the " +
      "canonical values keep ops-sheet / list_pending_cases filtering consistent.",
    ),
  resolution        : z
    .enum([
      "refunded_full",
      "refunded_partial",
      "app_credit",
      "discount_adjusted",
      "declined",
      "rejected",
      "abandoned",
    ])
    .optional(),
  resolution_reason : z.string().optional(),
  notes             : z
    .string()
    .optional()
    .describe(
      "Free-form internal notes. When the customer mentions WHY they uninstalled or downgraded PageFly (e.g. price, missing feature, switching to competitor, temporary pause, business closed), prepend the line '[uninstall_reason] <verbatim quote or short paraphrase>' so the ops team can grep for it later. Keep the prefix exact for downstream filtering.",
    ),

  // Refund math snapshot
  plan_name         : z.string().optional(),
  charge_amount_usd : z.number().optional(),
  num_cycles        : z.number().int().optional(),
  cycle_start       : z.string().optional(),
  cycle_end         : z.string().optional(),
  days_used         : z.number().int().optional(),
  days_unused       : z.number().int().optional(),
  deduction_percent : z.number().optional(),
  prorated_amount   : z.number().optional(),
  refund_amount     : z.number().optional(),
  currency          : z.string().optional().describe("ISO currency code. Defaults to USD."),

  // Info collection flags
  has_billing_invoice   : z.boolean().optional(),
  has_refund_reason     : z.boolean().optional(),
  has_bank_confirmation : z.boolean().optional(),
  is_downgraded_to_free : z.boolean().optional(),
  app_status            : z.enum(["installed", "uninstalled"]).optional(),
  store_status          : z.enum(["active", "closed"]).optional(),
  bill_status           : z.enum(["paid", "upcoming", "failed"]).optional(),

  // Commitment
  has_prior_commitment : z.boolean().optional(),
  committed_by         : z.string().optional().describe("Team member who made the commitment (e.g. Liam, Logan, Boo)"),
  committed_amount     : z.number().optional(),
  committed_notes      : z.string().optional(),

  // Escalation
  needs_manager           : z.boolean().optional(),
  manager_status          : z.enum(MANAGER_STATUS_VALUES).optional(),
  manager_approved_amount : z.number().optional(),
  manager_brief           : z.string().optional(),
  needs_shift_manager     : z.boolean().optional(),
  shift_manager_notified  : z.boolean().optional(),

  // Customer behavior
  is_angry           : z.boolean().optional(),
  threatened_review  : z.boolean().optional(),
  threatened_shopify : z.boolean().optional(),

  // Communication state
  winback_offered      : z.boolean().optional(),
  winback_accepted     : z.boolean().optional(),
  breakdown_sent       : z.boolean().optional(),
  breakdown_confirmed  : z.boolean().optional(),
  option_chosen        : z.enum(["A", "B"]).optional().describe("TH4: which Upcoming-bill option the customer chose"),
  followup_count       : z.number().int().optional(),
  last_agent_msg_at    : z.string().optional(),
  last_customer_msg_at : z.string().optional(),

  // Post-refund checklist
  refund_processed_at    : z.string().optional(),
  refund_screenshot_url  : z.string().optional(),
  crisp_note_added       : z.boolean().optional(),
  crisp_tag_refund_done  : z.boolean().optional(),
  form_submitted         : z.boolean().optional(),
  form_submitted_at      : z.string().optional(),

  // Multi-store grouping
  related_case_group : z.string().optional().describe("Free-form group ID shared by cases that should be handled together (e.g. multi-store Keychron)"),
} satisfies ZodRawShape;

/**************************************************************************
 * OUTPUT
 ***************************************************************************/

const SAVE_CASE_STATE_OUTPUT_SHAPE = {
  success : z.boolean().describe("Whether the upsert succeeded"),
  case    : z.object(CASE_RECORD_SHAPE).nullable().describe("The full case record after the upsert"),
  error   : z.string().nullable().describe("Error message when the write fails, otherwise null"),
} satisfies ZodRawShape;

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { SAVE_CASE_STATE_INPUT_SHAPE, SAVE_CASE_STATE_OUTPUT_SHAPE };

export type SaveCaseStateInput  = z.infer<z.ZodObject<typeof SAVE_CASE_STATE_INPUT_SHAPE>>;
export type SaveCaseStateOutput = z.infer<z.ZodObject<typeof SAVE_CASE_STATE_OUTPUT_SHAPE>>;
