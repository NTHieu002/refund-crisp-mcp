/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { z } from "zod";
import type { ZodRawShape } from "zod";

/**************************************************************************
 * CONSTANTS
 ***************************************************************************/

const CASE_TYPES = ["TH1", "TH2", "TH3", "TH4", "TH5", "TH6", "TH7", "TH8"] as const;

/**************************************************************************
 * INPUT
 ***************************************************************************/

const CLASSIFY_REFUND_CASE_INPUT_SHAPE = {
  reason : z
    .string()
    .describe(
      "Customer's stated reason in their own words (e.g. 'I uninstalled and want a refund').",
    ),
  store_status : z
    .enum(["active", "closed"])
    .describe("Whether the Shopify store is still open or has been closed."),
  app_status : z
    .enum(["installed", "uninstalled"])
    .describe("Whether the PageFly app is still installed on the store."),
  plan_status : z
    .enum(["paid", "free"])
    .describe(
      "Whether the store is currently on a paid plan or has already been downgraded to Free.",
    ),
  bill_status : z
    .enum(["paid", "upcoming", "failed"])
    .describe(
      "Status of the bill the customer is asking a refund for. 'failed' = the charge failed (store usually frozen) — no money received, so a refund is impossible; offer App Credit instead.",
    ),
  num_cycles_requested : z
    .number()
    .int()
    .min(1)
    .describe("Number of cycles the customer is asking to be refunded."),
  is_angry : z
    .boolean()
    .describe(
      "True if the customer is angry, threatens a bad review, or threatens to escalate to Shopify.",
    ),
  has_prior_commitment : z
    .boolean()
    .describe(
      "True if a PageFly team member OR an automated bot has previously committed to a (full) refund in the conversation history. Honor the commitment even if the previously quoted number was computed wrong — do not silently override a colleague's promise.",
    ),

  // --- Full-refund (0% deduction) triggers — see playbook addendum §2 ---
  feature_issue : z
    .boolean()
    .default(false)
    .describe("True if the refund is driven by a PageFly defect: app malfunction, broken/lost pages, editor bug, or a feature the customer paid for being discontinued."),
  service_failure : z
    .boolean()
    .default(false)
    .describe("True if support failed the customer (e.g. no reply for 3+ days), justifying a goodwill full refund."),
  is_trial_period : z
    .boolean()
    .default(false)
    .describe("True if the customer cancelled within the trial / never really used the paid plan."),
  is_returning_customer : z
    .boolean()
    .default(false)
    .describe("True if the customer is re-subscribing / will come back (e.g. accidental same-day charge on the wrong card) — refund in full to keep the relationship."),

  // --- Reduced-deduction (10%) triggers — see playbook addendum §1 ---
  is_yearly_plan : z
    .boolean()
    .default(false)
    .describe("True if this is a yearly (annual) plan — large amount; default to splitting Shopify fees (10%) rather than 20%."),
  customer_counters_deduction : z
    .boolean()
    .default(false)
    .describe("True if the customer pushes back on / refuses the 20% deduction. Meet them halfway at 10% (split Shopify fees equally)."),

  // --- Sensitive-case escalation flags — see playbook addendum §4 ---
  subscription_age_years : z
    .number()
    .default(0)
    .describe("How many years the customer has been subscribed. 2+ years = loyal customer → ALWAYS prioritise and route to Manager, even if policy would allow a decline."),
  is_high_value : z
    .boolean()
    .default(false)
    .describe("True for high-value accounts: yearly plan, multi-store, or an expensive plan. Route to Manager."),
  is_frustrated : z
    .boolean()
    .default(false)
    .describe("True if the customer is frustrated or has complained multiple times (milder than is_angry, but still a relationship risk). Route to Manager."),
  bad_review_risk : z
    .boolean()
    .default(false)
    .describe("True if there are signals the customer may leave a bad review. Route to Manager before risking it."),
  already_left_bad_review : z
    .boolean()
    .default(false)
    .describe("True if the customer has ALREADY left a 1-star / bad review. Escalate to Manager immediately and pivot toward a full refund to recover the relationship."),
  discount_commitment_claim : z
    .boolean()
    .default(false)
    .describe("True if the customer claims they were promised a discount that was not applied (overcharge). Requires Manager to verify the email proof — see calculate_refund discount_adjustment."),

  // --- Decline (TH8) signals — see playbook addendum §3 / §11 ---
  used_full_cycle : z
    .boolean()
    .default(false)
    .describe("True if the customer cancelled AFTER the billed cycle ended (cancel_date > cycle_end) — i.e. they used the full 30 days. Beware: Shopify often invoices a few days/weeks after the cycle starts, so compare cancel_date to cycle_start, not the invoice date."),
  has_recent_usage : z
    .boolean()
    .default(false)
    .describe("True if check_usage_data shows the app was actively used during the billed period (published or recently updated pages). Strong evidence to decline a 'I never used it' claim."),
} satisfies ZodRawShape;

/**************************************************************************
 * OUTPUT
 ***************************************************************************/

const CLASSIFY_REFUND_CASE_OUTPUT_SHAPE = {
  case_type : z
    .enum(CASE_TYPES)
    .describe("Matching case identifier from the refund playbook (TH1 to TH8). TH8 = decline the refund (cycle fully used / usage data proves active use / policy does not require a refund)."),
  case_description : z
    .string()
    .describe("Short human-readable description of the matched case."),
  can_self_decide : z
    .boolean()
    .describe("True when the agent is allowed to proceed without manager approval."),
  needs_manager : z
    .boolean()
    .describe("True when the refund requires Manager (Boo) approval before processing."),
  manager_reason : z
    .string()
    .describe("Why Manager approval is needed (empty string when needs_manager is false). Surface this in the manager brief."),
  needs_shift_manager : z
    .boolean()
    .describe("True when a Shift Manager must be mentioned (angry customer, threats)."),
  recommended_action : z
    .string()
    .describe("One-paragraph recommendation on how to handle the case."),
  deduction_percent : z
    .number()
    .describe("Suggested deduction percent (0, 10, 20 or 40). This is a SUGGESTION, not a final number — present any refund as an estimate subject to review."),
  requires_downgrade : z
    .boolean()
    .describe("Whether the store must be downgraded to Free before the refund can be issued."),
  requires_bill_paid : z
    .boolean()
    .describe("Whether the bill must reach Paid status before the refund can be issued."),
} satisfies ZodRawShape;

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { CLASSIFY_REFUND_CASE_INPUT_SHAPE, CLASSIFY_REFUND_CASE_OUTPUT_SHAPE };

export type ClassifyRefundCaseInput  = z.infer<z.ZodObject<typeof CLASSIFY_REFUND_CASE_INPUT_SHAPE>>;
export type ClassifyRefundCaseOutput = z.infer<z.ZodObject<typeof CLASSIFY_REFUND_CASE_OUTPUT_SHAPE>>;
