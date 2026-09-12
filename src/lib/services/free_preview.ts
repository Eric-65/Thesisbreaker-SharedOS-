/**
 * free_preview — the zero-credit tier.
 *
 * Runs the same reasoning pipeline as the paid tier, then deliberately
 * withholds most of it. The preview proves the service is real and useful; the
 * paid tier is where the analysis a caller can act on actually lives.
 *
 * Limits (enforced, not advisory):
 *   - short thesis only (600 chars)
 *   - caller-supplied evidence is NOT accepted
 *   - at most two weaknesses returned
 *   - no assumptions, risks, invalidation conditions, or recommendation
 */

import { PRICES } from "../arena/config";
import { runDecisionPipeline } from "../decision/pipeline";
import type { DecisionDomain, DecisionVerdict } from "../decision/types";
import type { PreviewRequest } from "./contracts";

export interface PreviewResponse {
  service: "free_preview";
  verdict: DecisionVerdict;
  score: number;
  confidence: number;
  /** At most two — the headline weaknesses only. */
  top_weaknesses: string[];
  summary: string;
  domain: DecisionDomain;
  /** What the paid tier would add for this exact input. */
  withheld: {
    critical_assumptions: number;
    contradicting_evidence: number;
    risks: number;
    invalidation_conditions: number;
    missing_evidence: number;
  };
  upgrade: {
    service: "break_thesis";
    price_credits: number;
    adds: string[];
  };
  latency_ms: number;
  demo: boolean;
}

const MAX_WEAKNESSES = 2;

export function runFreePreview(request: PreviewRequest): PreviewResponse {
  const started = Date.now();

  // The free tier never consumes caller-supplied evidence — that is a paid
  // capability. Only the statement itself reaches the pipeline.
  const full = runDecisionPipeline({
    statement: request.thesis,
    ...(request.domain ? { domain: request.domain } : {}),
  });

  const weaknesses: string[] = [];
  if (full.weakest_assumption) weaknesses.push(full.weakest_assumption);
  if (full.strongest_contradiction) weaknesses.push(full.strongest_contradiction);
  if (weaknesses.length < MAX_WEAKNESSES && full.largest_risk) {
    weaknesses.push(full.largest_risk);
  }
  if (weaknesses.length === 0 && full.critical_assumptions.length > 0) {
    weaknesses.push(full.critical_assumptions[0].text);
  }

  return {
    service: "free_preview",
    verdict: full.verdict,
    score: full.score,
    confidence: full.confidence,
    top_weaknesses: weaknesses.slice(0, MAX_WEAKNESSES),
    summary: full.summary,
    domain: full.domain,
    withheld: {
      critical_assumptions: full.critical_assumptions.length,
      contradicting_evidence: full.contradicting_evidence.length,
      risks: full.risks.length,
      invalidation_conditions: full.invalidation_conditions.length,
      missing_evidence: full.missing_evidence.length,
    },
    upgrade: {
      service: "break_thesis",
      price_credits: PRICES.break_thesis,
      adds: [
        "every critical assumption, weighted and challenged",
        "supporting and contradicting evidence, scored",
        "risk register with severities",
        "explicit invalidation conditions",
        "the evidence you are missing",
        "an actionable recommendation",
        "accepts your own evidence and sources",
      ],
    },
    latency_ms: Date.now() - started,
    demo: full.demo,
  };
}
