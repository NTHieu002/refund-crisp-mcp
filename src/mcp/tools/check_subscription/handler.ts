/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { STORES_MOCK } from "@fixtures/stores.js";

import type {
  CheckSubscriptionInput,
  CheckSubscriptionOutput,
} from "@/mcp/tools/check_subscription/shapes.js";

/**************************************************************************
 * HANDLER
 ***************************************************************************/

// Look up a PageFly subscription by store URL or customer email
function checkSubscriptionHandler(
  input: CheckSubscriptionInput,
): CheckSubscriptionOutput {
  if (!input.store_url && !input.email) {
    return {
      found        : false,
      subscription : null,
      error        : "Either store_url or email must be provided.",
    };
  }

  const needle = (input.store_url ?? "").toLowerCase();

  const match = STORES_MOCK.find((store) => {
    if (input.store_url && store.store_url.toLowerCase() === needle) {
      return true;
    }

    if (input.email && store.customer_email.toLowerCase() === input.email.toLowerCase()) {
      return true;
    }

    return false;
  }) ?? null;

  return {
    found        : match !== null,
    subscription : match,
    error        : null,
  };
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { checkSubscriptionHandler };
