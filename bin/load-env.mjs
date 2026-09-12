/**
 * Load environment for the standalone entry points.
 *
 * Next.js reads .env.local on its own, but the MCP server, CLI and Arena agent
 * are plain Node processes — without this they would start with no SHAREDNET_*
 * or SHAREDOS_* configuration and silently behave as if nothing was set.
 *
 * Resolved from the package root, not the working directory, so the commands
 * work from anywhere. A real environment variable always wins over a file.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// .env.local first: dotenv does not overwrite an already-set variable, so the
// more specific file wins, and anything exported in the shell wins over both.
for (const file of [".env.local", ".env"]) {
  const path = join(packageRoot, file);
  if (existsSync(path)) config({ path, quiet: true });
}
