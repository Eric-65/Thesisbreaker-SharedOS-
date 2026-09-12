import type {
  Assumption,
  EvidenceItem,
  Extraction,
  RiskItem,
  ScoreBand,
  ScoreBreakdown,
  Verdict,
  VerdictStatus,
} from "../types";
import { confidenceWeight, impactWeight } from "./evidence";

/**
 * ScoreEngine (deterministic)
 *
 * Produces a 0–100 THESIS QUALITY score using a fixed rubric:
 *   Evidence Support:       25
 *   Assumption Strength:    25
 *   Contradictions:         20
 *   Risk Definition:        15
 *   Invalidation Clarity:   15
 *
 * A separate Trade Readiness score (computed by `risk.ts`) captures
 * whether current Binance market conditions are suitable for acting
 * right now. The final verdict combines both signals:
 *
 *   Thesis quality   HIGH + readiness HIGH  → TRADE
 *   Thesis quality   HIGH + readiness LOW   → WAIT
 *   Thesis quality   LOW                    → NO_TRADE
 *   Any invalidation trigger                → INVALIDATED
 */
export function scoreThesis(input: {
  extraction: Extraction;
  assumptions: Assumption[];
  supporting: EvidenceItem[];
  contradictory: EvidenceItem[];
  uncertain: EvidenceItem[];
  risks: RiskItem[];
}): ScoreBreakdown {
  const { extraction, assumptions, supporting, contradictory, uncertain, risks } = input;

  const supStrength = supporting.reduce(
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
  const assumptionsEarned = Math.round(((supportedWeight + uncertainWeight) / totalWeight) * 25);

  const conStrength = contradictory.reduce(
    (s, e) => s + confidenceWeight(e.confidence) * impactWeight(e.impact),
    0,
  );
  const uncStrength = uncertain.reduce(
    (s, e) => s + confidenceWeight(e.confidence) * impactWeight(e.impact),
    0,
  );
  const contraPenalty = Math.min(20, Math.round(conStrength * 7 + uncStrength * 2));
  const contradictionsEarned = Math.max(0, 20 - contraPenalty);

  const highRisks = risks.filter((r) => r.severity === "HIGH").length;
  const medRisks = risks.filter((r) => r.severity === "MEDIUM").length;
  const riskEarned = Math.max(0, Math.min(15, 15 - highRisks * 4 - medRisks));

  const ic = extraction.invalidationConditions.length;
  const invalidationEarned = Math.min(15, ic * 5);

  const total = Math.max(
    0,
    Math.min(
      100,
      evidenceEarned + assumptionsEarned + contradictionsEarned + riskEarned + invalidationEarned,
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

export function scoreBand(score: number): ScoreBand {
  if (score >= 90) return "HIGH_CONVICTION";
  if (score >= 75) return "STRONG";
  if (score >= 60) return "TESTABLE";
  if (score >= 40) return "FRAGILE";
  return "WEAK";
}

export function verdictStatus(
  thesisScore: number,
  band: ScoreBand,
  breakdown: ScoreBreakdown,
  tradeReadiness: number,
  anyInvalidationTriggered: boolean,
): VerdictStatus {
  if (anyInvalidationTriggered) return "INVALIDATED";
  if (band === "WEAK") return "NO_TRADE";
  if (band === "FRAGILE") return "NO_TRADE";
  // Strong thesis but material contradictions → require readiness before TRADE
  const softThesis = breakdown.contradictions.earned <= 8;
  if (band === "STRONG" || band === "HIGH_CONVICTION") {
    if (softThesis) return "WAIT";
    if (tradeReadiness >= 65) return "TRADE";
    return "WAIT";
  }
  // TESTABLE (60-74)
  if (tradeReadiness >= 75) return "TRADE";
  return "WAIT";
}

export function buildVerdict(input: {
  breakdown: ScoreBreakdown;
  assumptions: Assumption[];
  supporting: EvidenceItem[];
  contradictory: EvidenceItem[];
  risks: RiskItem[];
  missingEvidence: string[];
  invalidationConditions: string[];
  tradeReadiness: number;
  tradeReadinessBand: "POOR" | "WEAK" | "MIXED" | "GOOD" | "STRONG";
}): Verdict {
  const {
    breakdown,
    assumptions,
    supporting,
    contradictory,
    risks,
    missingEvidence,
    invalidationConditions,
    tradeReadiness,
    tradeReadinessBand,
  } = input;
  const score = breakdown.total;
  const band = scoreBand(score);
  const status = verdictStatus(score, band, breakdown, tradeReadiness, false);

  const strongest = [...supporting].sort(
    (a, b) =>
      confidenceWeight(b.confidence) * impactWeight(b.impact) -
      confidenceWeight(a.confidence) * impactWeight(a.impact),
  )[0];

  const weakest = [...assumptions]
    .filter((a) => a.status !== "SUPPORTED")
    .sort((a, b) => b.weight - a.weight)[0];

  const largest =
    [...risks].sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0] ??
    ({ text: "General market risk.", severity: "MEDIUM" } as RiskItem);

  const bigContra = contradictory.length;
  const summary =
    status === "TRADE"
      ? "The thesis survives red-team analysis and current market conditions support acting on it now."
      : status === "WAIT"
        ? `The thesis is defensible${bigContra > 0 ? `, but ${bigContra} contradictory signal${bigContra === 1 ? "" : "s"} plus current market conditions do not support acting on it right now` : " but current Binance conditions do not support acting on it right now"}.`
        : status === "NO_TRADE"
          ? "The thesis is too fragile. Rework the assumptions or gather more evidence before proposing execution."
          : "A core assumption has been invalidated by new evidence. Do not act on this thesis in its current form.";

  const nextAction =
    status === "TRADE"
      ? "Review the proposed Binance Agent OS action and approve to submit."
      : status === "WAIT"
        ? tradeReadinessBand === "POOR" || tradeReadinessBand === "WEAK"
          ? "Wait for market conditions to improve. Monitor and re-challenge."
          : "Strengthen the weakest assumption, then re-challenge."
        : status === "NO_TRADE"
          ? "Do not propose an action. Rework the thesis."
          : "Do not act. Re-run analysis or drop the thesis.";

  return {
    score,
    band,
    status,
    tradeReadiness,
    tradeReadinessBand,
    summary,
    strongestFactor: strongest?.title ?? "No standout supporting evidence.",
    weakestAssumption: weakest?.text ?? "No materially weak assumption identified.",
    largestRisk: largest.text,
    missingEvidence,
    invalidationConditions,
    nextAction,
  };
}

function severityRank(s: string): number {
  if (s === "HIGH") return 3;
  if (s === "MEDIUM") return 2;
  return 1;
}

export function bandLabel(b: ScoreBand): string {
  switch (b) {
    case "WEAK":
      return "WEAK";
    case "FRAGILE":
      return "FRAGILE";
    case "TESTABLE":
      return "TESTABLE";
    case "STRONG":
      return "STRONG";
    case "HIGH_CONVICTION":
      return "HIGH CONVICTION";
  }
}

export function verdictLabel(v: VerdictStatus): string {
  switch (v) {
    case "TRADE":
      return "TRADE";
    case "WAIT":
      return "WAIT";
    case "NO_TRADE":
      return "NO TRADE";
    case "INVALIDATED":
      return "INVALIDATED";
  }
}
