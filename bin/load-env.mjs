/**
 * Load environment for the standalone entry points.
 *
 * Next.js reads .env.local on its own, but the MCP server, CLI and Arena agent
 * are plain Node processes — without this they would start with no SHAREDNET_*
 * or SHAREDOS_* configuration and silently behave as if nothing was set.
 *
 * Two locations are read, working directory first: someone running the
 * published package (`npx -p thesisbreaker …`) keeps their .env.local beside
 * their own project, where the package root is a cache directory they never
 * see. Someone running from a clone gets the repo's own file. A variable
 * exported in the shell always wins over both, and the first file to define a
 * variable wins over later ones — dotenv never overwrites what is already set.
 */

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const workingDir = process.cwd();

const roots = resolve(workingDir) === resolve(packageRoot)
  ? [packageRoot]
  : [workingDir, packageRoot];

for (const root of roots) {
  for (const file of [".env.local", ".env"]) {
    const path = join(root, file);
    if (existsSync(path)) config({ path, quiet: true });
  }
}
