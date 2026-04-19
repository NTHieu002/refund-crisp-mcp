/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { generateRefundMessageHandler } from "@/mcp/tools/generate_refund_message/handler.js";
import {
  GENERATE_REFUND_MESSAGE_INPUT_SHAPE,
  GENERATE_REFUND_MESSAGE_OUTPUT_SHAPE,
} from "@/mcp/tools/generate_refund_message/shapes.js";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  GenerateRefundMessageInput,
  GenerateRefundMessageOutput,
} from "@/mcp/tools/generate_refund_message/shapes.js";

/**************************************************************************
 * TOOL
 ***************************************************************************/

// Defining and registering our "generate_refund_message" tool
function registerGenerateRefundMessageTool(server: McpServer): void {
  server.registerTool(
    "generate_refund_message",
    {
      title       : "Generate refund message",
      description : `
        Use this tool to draft the reply that will be sent to the customer, combining
        the PageFly refund templates (intro, win-back offer, refund breakdown,
        Upcoming-bill options, case-specific blocks) into a single message.

        Common use-cases include:
        - Drafting a prorated refund message with a breakdown (TH1, TH3, TH7)
        - Drafting the explanation for a perceived double-charge (TH2)
        - Drafting the Upcoming-bill two-option message (TH4)
        - Drafting the holding message for unauthorized auto-upgrade (TH5)
        - Drafting the downgrade instructions when the customer just wants to stop
          charges (TH6)

        Call this tool after "classify_refund_case" and "calculate_refund". The
        returned message should still be reviewed by the agent before being sent.
      `,
      inputSchema  : GENERATE_REFUND_MESSAGE_INPUT_SHAPE,
      outputSchema : GENERATE_REFUND_MESSAGE_OUTPUT_SHAPE,
    },
    async (input: GenerateRefundMessageInput) => {
      const output: GenerateRefundMessageOutput = generateRefundMessageHandler(input);

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

export { registerGenerateRefundMessageTool };
