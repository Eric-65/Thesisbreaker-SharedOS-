import { runVerifyClaimPipeline } from "../decision/pipeline";
import type { VerifyClaimResult } from "../decision/types";
import { execute, type ExecutionResult, type GrantContext } from "../sharedos/adapter";
import { writeAudit } from "./audit";

export const VERIFY_CLAIM_REQUIRED_CAPABILITIES = [
  "read:submitted_decision",
  "read:submitted_evidence",
  "invoke:thesisbreaker.reasoning_pipeline",
  "return:verification_result",
];

export interface VerifyClaimRequest {
  claim: string;
  context?: string;
  sources?: string[];
  evidence?: string[];
}

export function validateVerifyClaimRequest(raw: unknown): {
  ok: true;
  value: VerifyClaimRequest;
} | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "request body must be a JSON object" };
  }
  const r = raw as Record<string, unknown>;
  const claim = typeof r.claim === "string" ? r.claim : "";
  if (!claim || claim.trim().length < 3) {
    return { ok: false, error: "`claim` (string, min 3 chars) is required" };
  }
  if (claim.length > 2000) {
    return { ok: false, error: "`claim` exceeds 2000 chars" };
  }
  const sources = Array.isArray(r.sources)
    ? (r.sources as unknown[]).filter((x) => typeof x === "string").slice(0, 16) as string[]
    : undefined;
  const evidence = Array.isArray(r.evidence)
    ? (r.evidence as unknown[]).filter((x) => typeof x === "string").slice(0, 16) as string[]
    : undefined;
  return {
    ok: true,
    value: {
      claim: claim.trim(),
      context: typeof r.context === "string" ? r.context.trim() : undefined,
      sources,
      evidence,
    },
  };
}

export async function runVerifyClaimService(
  request: VerifyClaimRequest,
  grants: GrantContext,
): Promise<ExecutionResult<VerifyClaimResult>> {
  return execute<VerifyClaimRequest, VerifyClaimResult>(
    { service: "verify_claim", request, grants },
    VERIFY_CLAIM_REQUIRED_CAPABILITIES,
    (req) => runVerifyClaimPipeline(req),
    async (record) => {
      await writeAudit(record, { request, callerName: grants.callerName });
    },
  );
}
