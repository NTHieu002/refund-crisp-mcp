/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { checkUsageDataHandler } from "@/mcp/tools/check_usage_data/handler.js";
import {
  CHECK_USAGE_DATA_INPUT_SHAPE,
  CHECK_USAGE_DATA_OUTPUT_SHAPE,
} from "@/mcp/tools/check_usage_data/shapes.js";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  CheckUsageDataInput,
  CheckUsageDataOutput,
} from "@/mcp/tools/check_usage_data/shapes.js";

/**************************************************************************
 * TOOL
 ***************************************************************************/

// Defining and registering our "check_usage_data" tool
function registerCheckUsageDataTool(server: McpServer): void {
  server.registerTool(
    "check_usage_data",
    {
      title       : "Check PageFly usage data",
      description : `
        Use this tool to check whether a store actively USED PageFly during a
        billing period — i.e. whether it has pages published or recently edited.

        Call it when a customer claims "I never used the app" or asks to refund a
        cycle they appear to have used. Pass the billed cycle as period_start /
        period_end so only relevant pages count. If has_usage is true, that is
        strong evidence to DECLINE the refund (TH8) — cite the page titles + dates
        from evidence_summary in your reply.

        IMPORTANT: when data_source is "unavailable" the usage source could not be
        reached. has_usage will be false, but that is NOT proof the customer didn't
        use the app — fall back to the cycle dates (cancel_date vs cycle_end) to
        decide. Never decline a loyal / high-value / at-risk customer on usage data
        alone; route those to a Manager (see classify_refund_case).
      `,
      inputSchema  : CHECK_USAGE_DATA_INPUT_SHAPE,
      outputSchema : CHECK_USAGE_DATA_OUTPUT_SHAPE,
    },
    async (input: CheckUsageDataInput) => {
      const output: CheckUsageDataOutput = await checkUsageDataHandler(input);

      return {
        content : [
          {
            type : "text",
            text : JSON.stringify(output, null, 2),
          },
        ],
        structuredContent : output,
      };
    },
  );
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { registerCheckUsageDataTool };
