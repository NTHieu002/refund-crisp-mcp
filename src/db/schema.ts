/**************************************************************************
 * SCHEMA
 ***************************************************************************/

// Embedded as a TS constant so that `tsc` emits it into dist/ without an
// extra build step to copy raw SQL files. All statements are idempotent.
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS cases (
  store_url                TEXT PRIMARY KEY,

  customer_name            TEXT,
  customer_email           TEXT,
  crisp_conversation_id    TEXT,
  assigned_agent           TEXT,

  case_type                TEXT,
  stage                    TEXT NOT NULL DEFAULT 'collecting_info',
  resolution               TEXT,
  resolution_reason        TEXT,
  notes                    TEXT,

  plan_name                TEXT,
  charge_amount_usd        REAL,
  num_cycles               INTEGER,
  cycle_start              TEXT,
  cycle_end                TEXT,
  days_used                INTEGER,
  days_unused              INTEGER,
  deduction_percent        INTEGER,
  prorated_amount          REAL,
  refund_amount            REAL,
  currency                 TEXT DEFAULT 'USD',

  has_billing_invoice      INTEGER DEFAULT 0,
  has_refund_reason        INTEGER DEFAULT 0,
  has_bank_confirmation    INTEGER DEFAULT 0,
  is_downgraded_to_free    INTEGER DEFAULT 0,
  app_status               TEXT,
  store_status             TEXT,
  bill_status              TEXT,

  has_prior_commitment     INTEGER DEFAULT 0,
  committed_by             TEXT,
  committed_amount         REAL,
  committed_notes          TEXT,

  needs_manager            INTEGER DEFAULT 0,
  manager_status           TEXT DEFAULT 'not_required',
  manager_approved_amount  REAL,
  manager_brief            TEXT,
  needs_shift_manager      INTEGER DEFAULT 0,
  shift_manager_notified   INTEGER DEFAULT 0,

  is_angry                 INTEGER DEFAULT 0,
  threatened_review        INTEGER DEFAULT 0,
  threatened_shopify       INTEGER DEFAULT 0,

  winback_offered          INTEGER DEFAULT 0,
  winback_accepted         INTEGER DEFAULT 0,
  breakdown_sent           INTEGER DEFAULT 0,
  breakdown_confirmed      INTEGER DEFAULT 0,
  option_chosen            TEXT,
  followup_count           INTEGER DEFAULT 0,
  last_agent_msg_at        TEXT,
  last_customer_msg_at     TEXT,

  refund_processed_at      TEXT,
  refund_screenshot_url    TEXT,
  crisp_note_added         INTEGER DEFAULT 0,
  crisp_tag_refund_done    INTEGER DEFAULT 0,
  form_submitted           INTEGER DEFAULT 0,
  form_submitted_at        TEXT,

  related_case_group       TEXT,

  created_at               TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at               TEXT DEFAULT CURRENT_TIMESTAMP
);
;;
CREATE INDEX IF NOT EXISTS idx_cases_stage           ON cases(stage);
;;
CREATE INDEX IF NOT EXISTS idx_cases_crisp           ON cases(crisp_conversation_id);
;;
CREATE INDEX IF NOT EXISTS idx_cases_manager_status  ON cases(manager_status);
;;
CREATE INDEX IF NOT EXISTS idx_cases_related         ON cases(related_case_group);
;;
CREATE INDEX IF NOT EXISTS idx_cases_email           ON cases(customer_email);
`;

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { SCHEMA_SQL };
