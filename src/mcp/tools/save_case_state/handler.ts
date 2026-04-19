/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { upsertCase } from "@/db/cases.js";

import type {
  SaveCaseStateInput,
  SaveCaseStateOutput,
} from "@/mcp/tools/save_case_state/shapes.js";
import type { CaseUpdates } from "@/db/cases.js";

/**************************************************************************
 * HELPERS
 ***************************************************************************/

function toInt(value: boolean | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value ? 1 : 0;
}

/**************************************************************************
 * HANDLER
 ***************************************************************************/

async function saveCaseStateHandler(
  input: SaveCaseStateInput,
): Promise<SaveCaseStateOutput> {
  try {
    const updates: CaseUpdates = {
      // Identity
      customer_name         : input.customer_name,
      customer_email        : input.customer_email,
      crisp_conversation_id : input.crisp_conversation_id,
      assigned_agent        : input.assigned_agent,

      // Classification
      case_type         : input.case_type,
      stage             : input.stage,
      resolution        : input.resolution,
      resolution_reason : input.resolution_reason,
      notes             : input.notes,

      // Refund math
      plan_name         : input.plan_name,
      charge_amount_usd : input.charge_amount_usd,
      num_cycles        : input.num_cycles,
      cycle_start       : input.cycle_start,
      cycle_end         : input.cycle_end,
      days_used         : input.days_used,
      days_unused       : input.days_unused,
      deduction_percent : input.deduction_percent,
      prorated_amount   : input.prorated_amount,
      refund_amount     : input.refund_amount,
      currency          : input.currency,

      // Info flags
      has_billing_invoice   : toInt(input.has_billing_invoice),
      has_refund_reason     : toInt(input.has_refund_reason),
      has_bank_confirmation : toInt(input.has_bank_confirmation),
      is_downgraded_to_free : toInt(input.is_downgraded_to_free),
      app_status            : input.app_status,
      store_status          : input.store_status,
      bill_status           : input.bill_status,

      // Commitment
      has_prior_commitment : toInt(input.has_prior_commitment),
      committed_by         : input.committed_by,
      committed_amount     : input.committed_amount,
      committed_notes      : input.committed_notes,

      // Escalation
      needs_manager           : toInt(input.needs_manager),
      manager_status          : input.manager_status,
      manager_approved_amount : input.manager_approved_amount,
      manager_brief           : input.manager_brief,
      needs_shift_manager     : toInt(input.needs_shift_manager),
      shift_manager_notified  : toInt(input.shift_manager_notified),

      // Behavior
      is_angry           : toInt(input.is_angry),
      threatened_review  : toInt(input.threatened_review),
      threatened_shopify : toInt(input.threatened_shopify),

      // Communication
      winback_offered      : toInt(input.winback_offered),
      winback_accepted     : toInt(input.winback_accepted),
      breakdown_sent       : toInt(input.breakdown_sent),
      breakdown_confirmed  : toInt(input.breakdown_confirmed),
      option_chosen        : input.option_chosen,
      followup_count       : input.followup_count,
      last_agent_msg_at    : input.last_agent_msg_at,
      last_customer_msg_at : input.last_customer_msg_at,

      // Post-refund
      refund_processed_at   : input.refund_processed_at,
      refund_screenshot_url : input.refund_screenshot_url,
      crisp_note_added      : toInt(input.crisp_note_added),
      crisp_tag_refund_done : toInt(input.crisp_tag_refund_done),
      form_submitted        : toInt(input.form_submitted),
      form_submitted_at     : input.form_submitted_at,

      // Grouping
      related_case_group : input.related_case_group,
    };

    const saved = await upsertCase(input.store_url, updates);

    return {
      success : true,
      case    : saved,
      error   : null,
    };
  } catch (error) {
    return {
      success : false,
      case    : null,
      error   : error instanceof Error ? error.message : String(error),
    };
  }
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { saveCaseStateHandler };
