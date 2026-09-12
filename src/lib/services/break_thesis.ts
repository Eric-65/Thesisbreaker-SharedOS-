import { runDecisionPipeline } from "../decision/pipeline";
import type { BreakThesisResult, DecisionRequest } from "../decision/types";
import { execute, type ExecutionResult, type GrantContext } from "../sharedos/adapter";
import { writeAudit } from "./audit";

/** Minimum permissions required to run break_thesis. Anything else is DENIED. */
export const BREAK_THESIS_REQUIRED_CAPABILITIES = [
  "read:submitted_decision",
  "read:submitted_evidence",
  "invoke:thesisbreaker.reasoning_pipeline",
  "return:verification_result",
];

export function validateBreakThesisRequest(raw: unknown): {
  ok: true;
  value: DecisionRequest;
} | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "request body must be a JSON object" };
  }
  const r = raw as Record<string, unknown>;
  const thesis = typeof r.thesis === "string" ? r.thesis : typeof r.statement === "string" ? r.statement : "";
  if (!thesis || thesis.trim().length < 5) {
    return { ok: false, error: "`thesis` (string, min 5 chars) is required" };
  }
  if (thesis.length > 4000) {
    return { ok: false, error: "`thesis` exceeds 4000 chars" };
  }
  const evidence = Array.isArray(r.evidence)
    ? (r.evidence as unknown[]).filter((x) => typeof x === "string").slice(0, 32) as string[]
    : undefined;
  const sources = Array.isArray(r.sources)
    ? (r.sources as unknown[]).filter((x) => typeof x === "string").slice(0, 32) as string[]
    : undefined;
  const constraints = Array.isArray(r.constraints)
    ? (r.constraints as unknown[]).filter((x) => typeof x === "string").slice(0, 16) as string[]
    : undefined;

  const domain = typeof r.domain === "string" ? r.domain : undefined;
  const validDomains = new Set([
    "trading",
    "business",
    "technical",
    "research",
    "strategic",
    "factual",
    "product",
    "general",
  ]);
  const domainSafe = (domain && validDomains.has(domain)) ? (domain as DecisionRequest["domain"]) : undefined;

  const value: DecisionRequest = {
    statement: thesis.trim(),
    context: typeof r.context === "string" ? r.context.trim() : undefined,
    evidence,
    sources,
    constraints,
    objective: typeof r.objective === "string" ? r.objective.trim() : undefined,
    domain: domainSafe,
  };
  return { ok: true, value };
}

/**
 * Execute the break_thesis Arena service as a SharedOS-style agent turn.
 */
export async function runBreakThesisService(
  request: DecisionRequest,
  grants: GrantContext,
): Promise<ExecutionResult<BreakThesisResult>> {
  return execute<DecisionRequest, BreakThesisResult>(
    { service: "break_thesis", request, grants },
    BREAK_THESIS_REQUIRED_CAPABILITIES,
    (req) => runDecisionPipeline(req),
    async (record) => {
      await writeAudit(record, { request, callerName: grants.callerName });
    },
  );
}
