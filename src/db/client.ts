/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { createClient } from "@libsql/client";
import type { Client } from "@libsql/client";

/**************************************************************************
 * STATE
 ***************************************************************************/

let client: Client | null = null;

/**************************************************************************
 * MAIN
 ***************************************************************************/

// Singleton libSQL/Turso client. Reads credentials from env vars on first call
function getDbClient(): Client {
  if (client !== null) {
    return client;
  }

  const url       = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error("TURSO_DATABASE_URL is not set. Copy .env.example to .env and fill in your Turso credentials.");
  }

  client = createClient({ url, authToken });

  return client;
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { getDbClient };
