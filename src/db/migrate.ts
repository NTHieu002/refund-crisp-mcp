/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { getDbClient } from "@/db/client.js";
import { SCHEMA_SQL } from "@/db/schema.js";

/**************************************************************************
 * MAIN
 ***************************************************************************/

// Apply the schema — idempotent, safe to run on every startup
async function runMigrations(): Promise<void> {
  const statements = SCHEMA_SQL
    .split(";;")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  const client = getDbClient();

  for (const statement of statements) {
    await client.execute(statement);
  }
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { runMigrations };
