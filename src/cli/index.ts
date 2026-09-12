/**
 * ThesisBreaker CLI.
 *
 * A second machine-callable entry point for agents and processes that do not
 * speak MCP. It calls exactly the same `invokeService` service layer, so it
 * runs through SharedOS authorization identically — the CLI cannot bypass it.
 *
 *   thesisbreaker catalog
 *   thesisbreaker free-preview --thesis "..."
 *   thesisbreaker verify-claim --claim "..." --evidence "..." --source "..."
 *   thesisbreaker break-thesis --thesis "..." --objective "..." --json
 *   thesisbreaker health
 *   thesisbreaker audit [--limit 20]
 */

import { SERVICE_NAMES, type ServiceName } from "../lib/arena/config";
import { checkArenaHealth } from "../lib/arena/health";
import { invokeService } from "../lib/services/invoke";
import { manifest } from "../lib/services/registry";
import { recentAuditEvents } from "../lib/sharedos/adapter";

interface Args {
  command: string;
  flags: Record<string, string[]>;
}

const COMMAND_TO_SERVICE: Record<string, ServiceName> = {
  "free-preview": "free_preview",
  free_preview: "free_preview",
  preview: "free_preview",
  "verify-claim": "verify_claim",
  verify_claim: "verify_claim",
  verify: "verify_claim",
  "break-thesis": "break_thesis",
  break_thesis: "break_thesis",
  break: "break_thesis",
};

export function parseArgs(argv: string[]): Args {
  const [command = "help", ...rest] = argv;
  const flags: Record<string, string[]> = {};
  let current: string | null = null;

  for (const token of rest) {
    if (token.startsWith("--")) {
      current = token.slice(2);
      flags[current] ??= [];
      continue;
    }
    if (current) {
      flags[current].push(token);
    }
  }
  return { command, flags };
}

const first = (flags: Args["flags"], key: string): string | undefined => flags[key]?.[0];
const all = (flags: Args["flags"], key: string): string[] | undefined =>
  flags[key] && flags[key].length > 0 ? flags[key] : undefined;

function buildPayload(service: ServiceName, flags: Args["flags"]): Record<string, unknown> {
  const evidence = all(flags, "evidence");
  const sources = all(flags, "source") ?? all(flags, "sources");
  const constraints = all(flags, "constraint") ?? all(flags, "constraints");

  if (service === "verify_claim") {
    return {
      claim: first(flags, "claim") ?? "",
      ...(first(flags, "context") ? { context: first(flags, "context") } : {}),
      ...(evidence ? { evidence } : {}),
      ...(sources ? { sources } : {}),
    };
  }

  if (service === "free_preview") {
    return {
      thesis: first(flags, "thesis") ?? first(flags, "statement") ?? "",
      ...(first(flags, "domain") ? { domain: first(flags, "domain") } : {}),
    };
  }

  return {
    thesis: first(flags, "thesis") ?? first(flags, "statement") ?? "",
    ...(first(flags, "context") ? { context: first(flags, "context") } : {}),
    ...(first(flags, "objective") ? { objective: first(flags, "objective") } : {}),
    ...(first(flags, "domain") ? { domain: first(flags, "domain") } : {}),
    ...(evidence ? { evidence } : {}),
    ...(sources ? { sources } : {}),
    ...(constraints ? { constraints } : {}),
  };
}

const HELP = `ThesisBreaker — break a decision before an agent acts on it.

USAGE
  thesisbreaker <command> [flags]

SERVICES
  free-preview   --thesis "..."                         0 credits
  verify-claim   --claim "..." [--evidence "..."]       5 credits
  break-thesis   --thesis "..." [--objective "..."]     10 credits

OTHER
  catalog        Print the machine-readable service catalogue
  health         Arena readiness check
  audit          Recent SharedOS kernel audit events

FLAGS
  --evidence     Repeatable. Evidence you already hold.
  --source       Repeatable. Source labels for your evidence.
  --constraint   Repeatable. Hard constraints (break-thesis).
  --context      Surrounding context.
  --objective    What you are trying to achieve (break-thesis).
  --domain       trading|business|technical|research|strategic|factual|product|general
  --caller       Your agent id (used as the SharedOS actor).
  --json         Print raw JSON only.
  --limit        audit: number of events.

Every call executes through the SharedOS kernel and is authorized and audited.
`;

export async function run(argv: string[]): Promise<number> {
  const { command, flags } = parseArgs(argv);
  const json = "json" in flags;
  const caller = {
    agentId: first(flags, "caller") ?? "cli:local",
    name: "thesisbreaker-cli",
  };

  if (command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(HELP);
    return 0;
  }

  if (command === "catalog") {
    process.stdout.write(`${JSON.stringify(manifest(), null, 2)}\n`);
    return 0;
  }

  if (command === "health") {
    const health = await checkArenaHealth();
    process.stdout.write(`${JSON.stringify(health, null, 2)}\n`);
    return health.status === "down" ? 1 : 0;
  }

  if (command === "audit") {
    const limit = Number.parseInt(first(flags, "limit") ?? "20", 10) || 20;
    process.stdout.write(`${JSON.stringify(recentAuditEvents(limit), null, 2)}\n`);
    return 0;
  }

  const service = COMMAND_TO_SERVICE[command];
  if (!service) {
    process.stderr.write(
      `${JSON.stringify({
        success: false,
        error: { code: "unknown_service", message: `unknown command: ${command}` },
        available: [...SERVICE_NAMES, "catalog", "health", "audit"],
      })}\n`,
    );
    return 2;
  }

  const envelope = await invokeService(service, buildPayload(service, flags), { caller });

  if (json) {
    process.stdout.write(`${JSON.stringify(envelope)}\n`);
    return envelope.success ? 0 : 1;
  }

  process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
  return envelope.success ? 0 : 1;
}

export async function main(): Promise<void> {
  try {
    process.exitCode = await run(process.argv.slice(2));
  } catch (err) {
    // A CLI customer still receives a structured error, never a stack trace.
    process.stderr.write(
      `${JSON.stringify({
        success: false,
        error: { code: "internal_error", message: (err as Error).message },
      })}\n`,
    );
    process.exitCode = 1;
  }
}
