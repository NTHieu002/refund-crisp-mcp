/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { z } from "zod";
import type { ZodRawShape } from "zod";

/**************************************************************************
 * MAIN
 ***************************************************************************/

// Shared output shape that describes a row in the "cases" table.
// Numeric boolean-like columns (0/1) are modeled as integers because that is
// how SQLite stores them; consumers can coerce to boolean with `Boolean(value)`.
const CASE_RECORD_SHAPE = {
  store_url                : z.string(),
  customer_name            : z.string().nullable(),
  customer_email           : z.string().nullable(),
  crisp_conversation_id    : z.string().nullable(),
  assigned_agent           : z.string().nullable(),
  case_type                : z.string().nullable(),
  stage                    : z.string(),
  resolution               : z.string().nullable(),
  resolution_reason        : z.string().nullable(),
  notes                    : z.string().nullable(),
  plan_name                : z.string().nullable(),
  charge_amount_usd        : z.number().nullable(),
  num_cycles               : z.number().nullable(),
  cycle_start              : z.string().nullable(),
  cycle_end                : z.string().nullable(),
  days_used                : z.number().nullable(),
  days_unused              : z.number().nullable(),
  deduction_percent        : z.number().nullable(),
  prorated_amount          : z.number().nullable(),
  refund_amount            : z.number().nullable(),
  currency                 : z.string().nullable(),
  has_billing_invoice      : z.number(),
  has_refund_reason        : z.number(),
  has_bank_confirmation    : z.number(),
  is_downgraded_to_free    : z.number(),
  app_status               : z.string().nullable(),
  store_status             : z.string().nullable(),
  bill_status              : z.string().nullable(),
  has_prior_commitment     : z.number(),
  committed_by             : z.string().nullable(),
  committed_amount         : z.number().nullable(),
  committed_notes          : z.string().nullable(),
  needs_manager            : z.number(),
  manager_status           : z.string(),
  manager_approved_amount  : z.number().nullable(),
  manager_brief            : z.string().nullable(),
  needs_shift_manager      : z.number(),
  shift_manager_notified   : z.number(),
  is_angry                 : z.number(),
  threatened_review        : z.number(),
  threatened_shopify       : z.number(),
  winback_offered          : z.number(),
  winback_accepted         : z.number(),
  breakdown_sent           : z.number(),
  breakdown_confirmed      : z.number(),
  option_chosen            : z.string().nullable(),
  followup_count           : z.number(),
  last_agent_msg_at        : z.string().nullable(),
  last_customer_msg_at     : z.string().nullable(),
  refund_processed_at      : z.string().nullable(),
  refund_screenshot_url    : z.string().nullable(),
  crisp_note_added         : z.number(),
  crisp_tag_refund_done    : z.number(),
  form_submitted           : z.number(),
  form_submitted_at        : z.string().nullable(),
  related_case_group       : z.string().nullable(),
  created_at               : z.string(),
  updated_at               : z.string(),
} satisfies ZodRawShape;

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { CASE_RECORD_SHAPE };
