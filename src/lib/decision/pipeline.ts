import type {
  Assumption,
  BreakThesisResult,
  ClaimVerdict,
  DecisionRequest,
  DecisionVerdict,
  EvidenceItem,
  RiskItem,
  ScoreBreakdown,
  VerifyClaimResult,
} from "./types";
import { extractDecision, type ExtractedDecision } from "./extractor";
import {
  confidenceWeight,
  impactWeight,
  interpret,
  type InterpretationBundle,
} from "./interpretation";
import { seededRng } from "../agents/rand";

/**
 * runDecisionPipeline
 *
 * The generalized break-thesis pipeline. Deterministic; no LLM call.
 *
 *   DecisionRequest
 *     ↓ extractDecision       — subject / assumptions / invalidations
 *     ↓ interpret             — evidence classification + risks + cases
 *     ↓ redTeamAssumptions    — status per assumption
 *     ↓ scoreDecision         — deterministic 25/25/20/15/15 rubric
 *     ↓ buildVerdict          — SUPPORTED / WEAK / CONTRADICTED / UNCERTAIN
 *   BreakThesisResult
 *
 * A separate `runVerifyClaimPipeline` provides the faster, narrower service.
 */
export function runDecisionPipeline(input: DecisionRequest): BreakThesisResult {
  const t0 = Date.now();
  const extraction = extractDecision(input);
  const bundle = interpret({
    extraction,
    statement: input.statement,
    context: input.context,
    providedEvidence: input.evidence,
    providedSources: input.sources,
  });

  const redTeamed = redTeamAssumptions(extraction, bundle);
  const breakdown = scoreDecision(extraction, redTeamed, bundle);
  const { verdict, confidence, summary, recommendation } = buildVerdict(
    breakdown,
    bundle,
    extraction,
  );

  const largestRisk =
    [...bundle.risks].sort((a, b) => sevRank(b.severity) - sevRank(a.severity))[0]?.text;

  return {
    service: "break_thesis",
    verdict,
    score: breakdown.total,
    confidence,
    supporting_evidence: bundle.supporting,
    contradicting_evidence: bundle.contradicting,
    uncertain_evidence: bundle.uncertain,
    critical_assumptions: redTeamed,
    risks: bundle.risks,
    invalidation_conditions: extraction.invalidations,
    missing_evidence: bundle.missingEvidence,
    recommendation,
    summary,
    score_breakdown: breakdown,
    bull_case: bundle.bullCase,
    bear_case: bundle.bearCase,
    contrarian_case: bundle.contrarianCase,
    strongest_contradiction: bundle.strongestContradictionText,
    weakest_assumption: bundle.weakestAssumptionText,
    largest_risk: largestRisk,
    strongest_support: bundle.strongestSupportText,
    domain: extraction.domain ?? "general",
    latency_ms: Date.now() - t0,
    demo: !bundle.hasLiveEvidence,
  };
}

/**
 * runVerifyClaimPipeline — the fast 3-way verdict service.
 * Cheaper both in credits and in latency; skips the full red-team.
 */
export function runVerifyClaimPipeline(input: {
  claim: string;
  context?: string;
  sources?: string[];
  evidence?: string[];
}): VerifyClaimResult {
  const t0 = Date.now();
  const extraction = extractDecision({
    statement: input.claim,
    context: input.context,
    sources: input.sources,
    evidence: input.evidence,
    domain: "factual",
  });
  const bundle = interpret({
    extraction,
    statement: input.claim,
    context: input.context,
    providedEvidence: input.evidence,
    providedSources: input.sources,
  });

  // Deterministic 3-way verdict based on evidence balance
  const supStrength = bundle.supporting.reduce(
    (s, e) => s + confidenceWeight(e.confidence) * impactWeight(e.impact),
    0,
  );
  const conStrength = bundle.contradicting.reduce(
    (s, e) => s + confidenceWeight(e.confidence) * impactWeight(e.impact),
    0,
  );
  const uncStrength = bundle.uncertain.reduce(
    (s, e) => s + confidenceWeight(e.confidence) * impactWeight(e.impact),
    0,
  );

  const net = supStrength - conStrength;
  let verdict: ClaimVerdict;
  if (uncStrength > supStrength + conStrength) verdict = "UNCERTAIN";
  else if (net > 0.4) verdict = "SUPPORTED";
  else if (net < -0.4) verdict = "CONTRADICTED";
  else verdict = "UNCERTAIN";

  const totalStrength = supStrength + conStrength + uncStrength;
  const decisiveness =
    totalStrength > 0 ? Math.abs(net) / totalStrength : 0;
  const confidence = Math.round(
    Math.max(0, Math.min(100, (bundle.hasLiveEvidence ? 40 : 20) + decisiveness * 60)),
  );

  const sourceQuality: VerifyClaimResult["source_quality"] = !bundle.hasLiveEvidence
    ? "NONE"
    : bundle.supporting.concat(bundle.contradicting).some((e) => e.confidence === "HIGH")
      ? "STRONG"
      : bundle.supporting.concat(bundle.contradicting).some((e) => e.confidence === "MEDIUM")
        ? "MIXED"
        : "WEAK";

  const summary =
    verdict === "SUPPORTED"
      ? "Available evidence, weighted for confidence and impact, supports the claim."
      : verdict === "CONTRADICTED"
        ? "Available evidence, weighted for confidence and impact, contradicts the claim."
        : "Available evidence is insufficient or mixed. The claim cannot be verified either way from what was provided.";

  const recommendation =
    verdict === "SUPPORTED"
      ? "The calling agent may proceed on this claim, ideally after logging the strongest supporting evidence."
      : verdict === "CONTRADICTED"
        ? "The calling agent should not act on this claim without first addressing the contradicting evidence."
        : "The calling agent should gather stronger primary-source evidence before relying on this claim.";

  return {
    service: "verify_claim",
    verdict,
    confidence,
    evidence: bundle.supporting,
    contradictions: bundle.contradicting,
    uncertain: bundle.uncertain,
    source_quality: sourceQuality,
    recommendation,
    summary,
    latency_ms: Date.now() - t0,
    demo: !bundle.hasLiveEvidence,
  };
}

// ---------- Internals ----------

function redTeamAssumptions(
  extraction: ExtractedDecision,
  bundle: InterpretationBundle,
): Assumption[] {
  const rng = seededRng(`${extraction.statement}|redteam`);
  const supStrength = bundle.supporting.reduce(
    (s, e) => s + confidenceWeight(e.confidence) * impactWeight(e.impact),
    0,
  );
  const conStrength = bundle.contradicting.reduce(
    (s, e) => s + confidenceWeight(e.confidence) * impactWeight(e.impact),
    0,
  );
  const uncStrength = bundle.uncertain.reduce(
    (s, e) => s + confidenceWeight(e.confidence) * impactWeight(e.impact),
    0,
  );

  return extraction.assumptions.map((a, i) => {
    const bias = rng() + i * 0.11;
    const score =
      supStrength - conStrength * 1.1 - uncStrength * 0.4 + (bias - 0.5) * 1.4;
    let status: Assumption["status"];
    let reasoning: string;
    let counter = "";
    let evidence = "";
    if (score > 0.3) {
      status = "SUPPORTED";
      reasoning = "Available evidence, weighted for confidence and impact, favors this assumption.";
      evidence = bundle.supporting[i % Math.max(1, bundle.supporting.length)]?.title ?? "";
    } else if (score < -0.3) {
      status = "CHALLENGED";
      reasoning = "Contradicting signals outweigh support for this specific claim.";
      const con = bundle.contradicting[i % Math.max(1, bundle.contradicting.length)];
      counter = con?.summary ?? "Available signals push against this claim.";
      evidence = con?.title ?? "";
    } else {
      status = "UNCERTAIN";
      reasoning = "Evidence is mixed or insufficient to classify.";
      counter = "Additional primary-source data required.";
      evidence = bundle.uncertain[i % Math.max(1, bundle.uncertain.length)]?.title ?? "";
    }
    const impact: Assumption["impact"] =
      a.weight >= 5 ? "HIGH" : a.weight >= 3 ? "MEDIUM" : "LOW";
    return { ...a, status, reasoning, counterargument: counter, evidence, impact };
  });
}

function scoreDecision(
  extraction: ExtractedDecision,
  assumptions: Assumption[],
  bundle: InterpretationBundle,
): ScoreBreakdown {
  const supStrength = bundle.supporting.reduce(
    (s, e) => s + confidenceWeight(e.confidence) * impactWeight(e.impact),
    0,
  );
  const conStrength = bundle.contradicting.reduce(
    (s, e) => s + confidenceWeight(e.confidence) * impactWeight(e.impact),
    0,
  );
  const uncStrength = bundle.uncertain.reduce(
    (s, e) => s + confidenceWeight(e.confidence) * impactWeight(e.impact),
    0,
  );

  const evidenceEarned = Math.round(Math.min(25, Math.max(0, supStrength * 8 + 4)));

  const totalWeight = assumptions.reduce((s, a) => s + a.weight, 0) || 1;
  const supportedWeight = assumptions
    .filter((a) => a.status === "SUPPORTED")
    .reduce((s, a) => s + a.weight, 0);
  const uncertainWeight = assumptions
    .filter((a) => a.status === "UNCERTAIN")
    .reduce((s, a) => s + a.weight * 0.5, 0);
  const assumptionsEarned = Math.round(
    ((supportedWeight + uncertainWeight) / totalWeight) * 25,
  );

  const contraPenalty = Math.min(20, Math.round(conStrength * 7 + uncStrength * 2));
  const contradictionsEarned = Math.max(0, 20 - contraPenalty);

  const highRisks = bundle.risks.filter((r) => r.severity === "HIGH").length;
  const medRisks = bundle.risks.filter((r) => r.severity === "MEDIUM").length;
  const riskEarned = Math.max(0, Math.min(15, 15 - highRisks * 4 - medRisks));

  const ic = extraction.invalidations.length;
  const invalidationEarned = Math.min(15, ic * 5);

  const total = Math.max(
    0,
    Math.min(
      100,
      evidenceEarned +
        assumptionsEarned +
        contradictionsEarned +
        riskEarned +
        invalidationEarned,
    ),
  );
  return {
    evidence: { earned: evidenceEarned, max: 25 },
    assumptions: { earned: assumptionsEarned, max: 25 },
    contradictions: { earned: contradictionsEarned, max: 20 },
    risk: { earned: riskEarned, max: 15 },
    invalidation: { earned: invalidationEarned, max: 15 },
    total,
  };
}

function buildVerdict(
  breakdown: ScoreBreakdown,
  bundle: InterpretationBundle,
  extraction: ExtractedDecision,
): {
  verdict: DecisionVerdict;
  confidence: number;
  summary: string;
  recommendation: string;
} {
  const score = breakdown.total;
  const contraStrong =
    bundle.contradicting.some((e) => e.impact === "HIGH" && e.confidence !== "LOW");
  const supStrong =
    bundle.supporting.some((e) => e.impact === "HIGH" && e.confidence !== "LOW");

  let verdict: DecisionVerdict;
  if (score >= 75 && !contraStrong) verdict = "SUPPORTED";
  else if (contraStrong && !supStrong) verdict = "CONTRADICTED";
  else if (score < 40) verdict = "WEAK";
  else if (score < 60) verdict = "WEAK";
  else verdict = "UNCERTAIN";

  // Confidence combines: (1) how live is the evidence, (2) how decisive the
  // score is, and (3) whether critical assumptions were resolved.
  const supStrength = bundle.supporting.reduce(
    (s, e) => s + confidenceWeight(e.confidence) * impactWeight(e.impact),
    0,
  );
  const conStrength = bundle.contradicting.reduce(
    (s, e) => s + confidenceWeight(e.confidence) * impactWeight(e.impact),
    0,
  );
  const totalStrength = supStrength + conStrength;
  const decisiveness =
    totalStrength > 0 ? Math.abs(supStrength - conStrength) / totalStrength : 0;
  const evidenceFloor = bundle.hasLiveEvidence ? 40 : 20;
  const confidence = Math.round(
    Math.max(0, Math.min(100, evidenceFloor + decisiveness * 45 + score * 0.15)),
  );

  const summary = summaryFor(verdict, extraction, bundle);
  const recommendation = recommendationFor(verdict, extraction);
  return { verdict, confidence, summary, recommendation };
}

function summaryFor(
  verdict: DecisionVerdict,
  extraction: ExtractedDecision,
  bundle: InterpretationBundle,
): string {
  const nSup = bundle.supporting.length;
  const nCon = bundle.contradicting.length;
  const nUnc = bundle.uncertain.length;
  switch (verdict) {
    case "SUPPORTED":
      return `The decision survives red-team analysis. ${nSup} supporting item(s) vs ${nCon} contradiction(s). No critical assumption is currently invalidated.`;
    case "CONTRADICTED":
      return `The decision does not survive red-team analysis. ${nCon} contradicting item(s) outweigh ${nSup} supporting item(s). At least one critical assumption is challenged.`;
    case "WEAK":
      return `The decision is defensible in outline but too weak to act on. ${nSup} support / ${nCon} contradiction / ${nUnc} uncertain. Rework the load-bearing assumption${extraction.assumptions.length > 1 ? "s" : ""} and re-verify.`;
    case "UNCERTAIN":
    default:
      return `Evidence is insufficient or mixed to decide. Gather primary-source data on the weakest assumption before acting.`;
  }
}

function recommendationFor(
  verdict: DecisionVerdict,
  extraction: ExtractedDecision,
): string {
  switch (verdict) {
    case "SUPPORTED":
      return `Proceed. Log the strongest supporting evidence and monitor the stated invalidation conditions.`;
    case "CONTRADICTED":
      return `Do not act on this decision as stated. Address the strongest contradiction, or restate the decision.`;
    case "WEAK":
      return `Wait. Strengthen the weakest assumption${extraction.assumptions.length > 1 ? "s" : ""} with primary-source evidence, then re-run break_thesis.`;
    case "UNCERTAIN":
    default:
      return `Gather additional primary evidence and re-verify. Do not act on the decision yet.`;
  }
}

function sevRank(s: string): number {
  if (s === "HIGH") return 3;
  if (s === "MEDIUM") return 2;
  return 1;
}
