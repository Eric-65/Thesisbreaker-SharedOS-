import type { AnalysisResult, Direction, Extraction, InvalidationCondition } from "../types";
import { extractThesis } from "./extractor";
import { gatherEvidence, confidenceWeight, impactWeight } from "./evidence";
import { runRedTeam } from "./redTeam";
import { buildVerdict, scoreThesis } from "./score";
import { seededRng } from "./rand";
import { computeTradeReadiness } from "../risk";
import { getBars, resolveIdentity } from "../market/router";

/**
 * AgentPipeline — the full decision pipeline for a Binance thesis.
 *
 *   USER TEXT
 *     ↓  ThesisExtractor
 *   Extraction
 *     ↓  EvidenceEngine (Binance quote + historical bars + model interpretation)
 *   Evidence bundle
 *     ↓  RedTeamAgent
 *   Red-team result
 *     ↓  ScoreEngine (deterministic 25/25/20/15/15 rubric)
 *     ↓  Trade Readiness (deterministic market-conditions rubric)
 *   Verdict + AnalysisResult
 */

export interface PipelineInput {
  symbol: string;
  direction: Direction;
  timeHorizon: string;
  originalText: string;
  catalysts?: string;
  expectedOutcome?: string;
  extractionOverride?: Extraction;
  assetType?: "STOCK" | "ETF" | "CRYPTO" | "NFT_COLLECTION";
}

export async function runPipeline(input: PipelineInput): Promise<AnalysisResult> {
  const extraction =
    input.extractionOverride ??
    extractThesis({
      symbol: input.symbol,
      direction: input.direction,
      timeHorizon: input.timeHorizon,
      originalText: input.originalText,
      catalysts: input.catalysts,
      expectedOutcome: input.expectedOutcome,
      assetType: input.assetType,
    });

  const evidence = await gatherEvidence(
    input.symbol,
    input.direction,
    extraction,
    input.originalText,
    input.assetType,
  );

  const redTeam = runRedTeam(
    input.symbol,
    input.direction,
    extraction,
    evidence,
    input.originalText,
  );

  const breakdown = scoreThesis({
    extraction,
    assumptions: redTeam.assumptions,
    supporting: evidence.supporting,
    contradictory: evidence.contradictory,
    uncertain: evidence.uncertain,
    risks: redTeam.risks,
  });

  // Trade readiness — deterministic, based on live market conditions
  const identity = resolveIdentity(input.symbol);
  const bars =
    identity && identity.assetType !== "NFT_COLLECTION"
      ? await getBars(identity, "30D")
      : null;
  const readiness = computeTradeReadiness({
    quote: evidence.quote,
    bars,
    direction: input.direction,
  });

  const verdict = buildVerdict({
    breakdown,
    assumptions: redTeam.assumptions,
    supporting: evidence.supporting,
    contradictory: evidence.contradictory,
    risks: redTeam.risks,
    missingEvidence: redTeam.missingEvidence,
    invalidationConditions: extraction.invalidationConditions,
    tradeReadiness: readiness.score,
    tradeReadinessBand: readiness.band,
  });

  const strongestContra = [...evidence.contradictory].sort(
    (a, b) =>
      confidenceWeight(b.confidence) * impactWeight(b.impact) -
      confidenceWeight(a.confidence) * impactWeight(a.impact),
  )[0];

  const rngInv = seededRng(`${input.symbol}|invalidations|${input.originalText}`);
  const contraCount = evidence.contradictory.length;
  const invalidations: InvalidationCondition[] = extraction.invalidationConditions.map(
    (text, i) => {
      let status: InvalidationCondition["status"] = "NOT_TRIGGERED";
      let detail = "No evidence yet suggests this condition has been met.";
      if (contraCount >= 2 && i === 0) {
        status = "WATCHING";
        detail = "Contradictory evidence is starting to accumulate. Monitor closely.";
      } else if (contraCount >= 3 && i === 1 && rngInv() > 0.5) {
        status = "WATCHING";
        detail = "Sector signals warrant closer monitoring of this condition.";
      }
      return { id: `inv_${i}`, text, status, detail };
    },
  );

  return {
    claim: extraction.mainClaim,
    timeframe: input.timeHorizon,
    extraction: { ...extraction, invalidations },
    assumptions: redTeam.assumptions,
    bullCase: redTeam.bullCase,
    bearCase: redTeam.bearCase,
    contrarianCase: redTeam.contrarianCase,
    supportingEvidence: evidence.supporting,
    contradictoryEvidence: evidence.contradictory,
    uncertainEvidence: evidence.uncertain,
    weakAssumptions: redTeam.weakAssumptions,
    missingEvidence: redTeam.missingEvidence,
    invalidationConditions: extraction.invalidationConditions,
    invalidations,
    riskFactors: redTeam.risks,
    scoreBreakdown: breakdown,
    score: breakdown.total,
    verdict,
    strongestContradiction: strongestContra?.title
      ? `${strongestContra.title} — ${strongestContra.summary}`
      : undefined,
    demo: evidence.mode === "demo",
    dataMode: evidence.mode,
  };
}

export { extractThesis };
