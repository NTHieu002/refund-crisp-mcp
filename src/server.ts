/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { createMcpServer } from "@/mcp/index.js";
import { runMigrations }   from "@/db/migrate.js";
import { mcpLogger }       from "@/utils/logger.js";

/**************************************************************************
 * SERVER
 ***************************************************************************/

const app = express();
app.use(express.json());

const server = createMcpServer();

// Registering a welcome message at the root endpoint
app.get("/", (_req, res) => {
  res.send(
    "Welcome to the PageFly Refund MCP Server! Use the /mcp endpoint to interact with this MCP server.",
  );
});

// Registering Health check endpoint
app.get("/health", (_req, res) => {
  res.status(200).send("OK");
});

// Registering MCP endpoint
app.post("/mcp", (req, res) => {
  // Optionally set up an authentication middleware here (e.g. Bearer token or Basic Auth)

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator  : undefined,
    enableJsonResponse  : true,
  });

  res.on("close", () => {
    transport.close();
  });

  res.on("finish", () => {
    mcpLogger("out", { statusCode: res.statusCode });
  });

  // DIAG (temporary): log headers alongside the body to discover how Crisp
  // delivers the conversation session_id (custom header vs _meta vs tool arg).
  // Remove once the delivery mechanism is confirmed.
  mcpLogger("in", { headers: req.headers, body: req.body });

  server
    .connect(transport)
    .then(() => transport.handleRequest(req, res, req.body))
    .catch((error: unknown) => {
      mcpLogger("error", error);

      if (!res.headersSent) {
        res.status(500).json({ error: "MCP request failed" });
      }
    });
});

// Run DB migrations, then start listening
const port = Number.parseInt(process.env.PORT ?? "3000", 10);

runMigrations()
  .then(() => {
    app.listen(port, () => {
      console.log(`Refund MCP Server running on http://localhost:${port}/mcp`);
    });
  })
  .catch((error: unknown) => {
    console.error("Failed to run DB migrations:", error);
    process.exit(1);
  });
