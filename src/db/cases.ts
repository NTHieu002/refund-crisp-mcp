/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { getDbClient } from "@/db/client.js";

import type { InValue, Row } from "@libsql/client";

/**************************************************************************
 * TYPES
 ***************************************************************************/

type CaseColumn =
  | "customer_name"
  | "customer_email"
  | "crisp_conversation_id"
  | "assigned_agent"
  | "case_type"
  | "stage"
  | "resolution"
  | "resolution_reason"
  | "notes"
  | "plan_name"
  | "charge_amount_usd"
  | "num_cycles"
  | "cycle_start"
  | "cycle_end"
  | "days_used"
  | "days_unused"
  | "deduction_percent"
  | "prorated_amount"
  | "refund_amount"
  | "currency"
  | "has_billing_invoice"
  | "has_refund_reason"
  | "has_bank_confirmation"
  | "is_downgraded_to_free"
  | "app_status"
  | "store_status"
  | "bill_status"
  | "has_prior_commitment"
  | "committed_by"
  | "committed_amount"
  | "committed_notes"
  | "needs_manager"
  | "manager_status"
  | "manager_approved_amount"
  | "manager_brief"
  | "needs_shift_manager"
  | "shift_manager_notified"
  | "is_angry"
  | "threatened_review"
  | "threatened_shopify"
  | "winback_offered"
  | "winback_accepted"
  | "breakdown_sent"
  | "breakdown_confirmed"
  | "option_chosen"
  | "followup_count"
  | "last_agent_msg_at"
  | "last_customer_msg_at"
  | "refund_processed_at"
  | "refund_screenshot_url"
  | "crisp_note_added"
  | "crisp_tag_refund_done"
  | "form_submitted"
  | "form_submitted_at"
  | "related_case_group";

type CaseUpdates = Partial<Record<CaseColumn, InValue>>;

interface CaseRow {
  store_url                : string;
  customer_name            : string | null;
  customer_email           : string | null;
  crisp_conversation_id    : string | null;
  assigned_agent           : string | null;
  case_type                : string | null;
  stage                    : string;
  resolution               : string | null;
  resolution_reason        : string | null;
  notes                    : string | null;
  plan_name                : string | null;
  charge_amount_usd        : number | null;
  num_cycles               : number | null;
  cycle_start              : string | null;
  cycle_end                : string | null;
  days_used                : number | null;
  days_unused              : number | null;
  deduction_percent        : number | null;
  prorated_amount          : number | null;
  refund_amount            : number | null;
  currency                 : string | null;
  has_billing_invoice      : number;
  has_refund_reason        : number;
  has_bank_confirmation    : number;
  is_downgraded_to_free    : number;
  app_status               : string | null;
  store_status             : string | null;
  bill_status              : string | null;
  has_prior_commitment     : number;
  committed_by             : string | null;
  committed_amount         : number | null;
  committed_notes          : string | null;
  needs_manager            : number;
  manager_status           : string;
  manager_approved_amount  : number | null;
  manager_brief            : string | null;
  needs_shift_manager      : number;
  shift_manager_notified   : number;
  is_angry                 : number;
  threatened_review        : number;
  threatened_shopify       : number;
  winback_offered          : number;
  winback_accepted         : number;
  breakdown_sent           : number;
  breakdown_confirmed      : number;
  option_chosen            : string | null;
  followup_count           : number;
  last_agent_msg_at        : string | null;
  last_customer_msg_at     : string | null;
  refund_processed_at      : string | null;
  refund_screenshot_url    : string | null;
  crisp_note_added         : number;
  crisp_tag_refund_done    : number;
  form_submitted           : number;
  form_submitted_at        : string | null;
  related_case_group       : string | null;
  created_at               : string;
  updated_at               : string;
}

/**************************************************************************
 * HELPERS
 ***************************************************************************/

function rowToCase(row: Row): CaseRow {
  return row as unknown as CaseRow;
}

/**************************************************************************
 * QUERIES
 ***************************************************************************/

async function upsertCase(
  store_url : string,
  updates   : CaseUpdates,
): Promise<CaseRow> {
  const client = getDbClient();

  const entries = Object.entries(updates).filter(
    ([, value]) => value !== undefined,
  ) as [CaseColumn, InValue][];

  if (entries.length === 0) {
    await client.execute({
      sql  : "INSERT OR IGNORE INTO cases (store_url) VALUES (?)",
      args : [store_url],
    });
  } else {
    const columns        = entries.map(([column]) => column);
    const values         = entries.map(([, value]) => value);
    const insertColumns  = ["store_url", ...columns].join(", ");
    const placeholders   = ["?", ...columns.map(() => "?")].join(", ");
    const updateSet      = columns
      .map((column) => `${column} = excluded.${column}`)
      .concat("updated_at = CURRENT_TIMESTAMP")
      .join(", ");

    await client.execute({
      sql :
        `INSERT INTO cases (${insertColumns}) VALUES (${placeholders}) ` +
        `ON CONFLICT(store_url) DO UPDATE SET ${updateSet}`,
      args : [store_url, ...values],
    });
  }

  const fresh = await getCase(store_url);

  if (fresh === null) {
    throw new Error(`Case ${store_url} missing after upsert`);
  }

  return fresh;
}

async function getCase(store_url: string): Promise<CaseRow | null> {
  const client = getDbClient();
  const result = await client.execute({
    sql  : "SELECT * FROM cases WHERE store_url = ? LIMIT 1",
    args : [store_url],
  });

  const row = result.rows[0];

  return row ? rowToCase(row) : null;
}

async function listCasesByStage(
  stage : string | null,
  limit : number,
): Promise<CaseRow[]> {
  const client = getDbClient();

  const result = stage
    ? await client.execute({
        sql  : "SELECT * FROM cases WHERE stage = ? ORDER BY updated_at DESC LIMIT ?",
        args : [stage, limit],
      })
    : await client.execute({
        sql  : "SELECT * FROM cases ORDER BY updated_at DESC LIMIT ?",
        args : [limit],
      });

  return result.rows.map(rowToCase);
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { upsertCase, getCase, listCasesByStage };
export type { CaseRow, CaseUpdates, CaseColumn };
