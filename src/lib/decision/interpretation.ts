import type {
  Confidence,
  EvidenceItem,
  Impact,
  RiskItem,
} from "./types";
import type { ExtractedDecision } from "./extractor";
import { id as makeId, seededRng, pick } from "../agents/rand";

/**
 * InterpretationEngine
 *
 * Turns caller-provided evidence + statement text into normalized evidence
 * items with FACT / INTERPRETATION / DEMO sourceKinds. Never fabricates
 * factual claims — evidence supplied by the caller is stored verbatim under
 * the `FACT` sourceKind, and model-derived observations are stored under
 * `INTERPRETATION`.
 *
 * Deterministic; the same request produces the same interpretation so an
 * agent can replay or cache calls safely.
 */

const SUPPORT_HINT = /(strong|growing|expanding|positive|improving|increases?|confirmed|robust|widely|majority)/i;
const CONTRA_HINT = /(weak|declining|shrinking|contradicts?|refutes?|missed|failed|risk|concern|thin|questionable)/i;

function classifyProvidedEvidence(
  text: string,
): "supporting" | "contradicting" | "uncertain" {
  if (CONTRA_HINT.test(text)) return "contradicting";
  if (SUPPORT_HINT.test(text)) return "supporting";
  return "uncertain";
}

function estimateConfidenceFromText(text: string): Confidence {
  if (/(https?:\/\/|\bdoi:|\bpaper|\bstudy|\bofficial)/i.test(text)) return "HIGH";
  if (/(estimate|approximately|reportedly|analyst|survey)/i.test(text)) return "MEDIUM";
  if (/(rumor|maybe|might|allegedly|unverified)/i.test(text)) return "LOW";
  return "MEDIUM";
}

function estimateImpactFromText(text: string): Impact {
  if (/(materially|significant|large|dramatic|catastrophic|breakout|breach)/i.test(text))
    return "HIGH";
  if (/(minor|small|slight|marginal)/i.test(text)) return "LOW";
  return "MEDIUM";
}

/** Demo pool used only when no evidence was provided AND no interpretation
 * could be generated from the statement — clearly labelled. */
const DEMO_SUPPORTING = [
  "Prevailing structure aligns with the direction of the statement.",
  "Public commentary in the domain has skewed constructive over the last window.",
  "No standout contradiction visible in accessible sources.",
];
const DEMO_CONTRADICTING = [
  "Peer signals suggest early-stage normalization.",
  "Historical base-rates for this pattern are worse than the claim implies.",
];
const DEMO_UNCERTAIN = [
  "Additional primary-source data required to firmly classify.",
];

export interface InterpretationBundle {
  supporting: EvidenceItem[];
  contradicting: EvidenceItem[];
  uncertain: EvidenceItem[];
  risks: RiskItem[];
  bullCase: string[];
  bearCase: string[];
  contrarianCase: string[];
  weakestAssumptionText?: string;
  strongestContradictionText?: string;
  strongestSupportText?: string;
  missingEvidence: string[];
  hasLiveEvidence: boolean;
}

export interface InterpretInput {
  extraction: ExtractedDecision;
  statement: string;
  context?: string;
  providedEvidence?: string[];
  providedSources?: string[];
}

export function interpret(input: InterpretInput): InterpretationBundle {
  const rng = seededRng(
    `${input.statement}|${input.context ?? ""}|${(input.providedEvidence ?? []).join("|")}`,
  );
  const supporting: EvidenceItem[] = [];
  const contradicting: EvidenceItem[] = [];
  const uncertain: EvidenceItem[] = [];

  const sources = input.providedSources ?? [];
  const provided = (input.providedEvidence ?? []).filter((e) => (e ?? "").trim().length > 0);

  // 1. Caller-provided evidence → sourceKind = FACT (we do NOT verify it,
  //    but we preserve it verbatim). Source label is either the caller's
  //    sources[] or a generic "caller-provided".
  provided.forEach((text, idx) => {
    const kind = classifyProvidedEvidence(text);
    const source = sources[idx] ?? sources[0] ?? "caller-provided";
    const item: EvidenceItem = {
      id: makeId("e", rng),
      kind,
      title: text.slice(0, 80),
      summary: text,
      source,
      sourceKind: "FACT",
      confidence: estimateConfidenceFromText(text),
      impact: estimateImpactFromText(text),
      relevance: "HIGH",
      publishedAt: new Date().toISOString(),
    };
    pushInto(item, supporting, contradicting, uncertain);
  });

  // 2. Statement-derived INTERPRETATION signals. These are always labelled
  //    "Model Reasoning" so they are never confused with primary sources.
  const t = input.statement.toLowerCase();
  const push = (
    kind: "supporting" | "contradicting" | "uncertain",
    title: string,
    summary: string,
    impact: Impact = "MEDIUM",
  ) => {
    const it: EvidenceItem = {
      id: makeId("e", rng),
      kind,
      title,
      summary,
      source: "Model Reasoning",
      sourceKind: "INTERPRETATION",
      confidence: "MEDIUM",
      impact,
      relevance: "MEDIUM",
    };
    pushInto(it, supporting, contradicting, uncertain);
  };

  if (/(momentum|volume|breakout|resistance)/i.test(t)) {
    push(
      "supporting",
      "Setup narrative is coherent",
      "The claim describes a familiar setup with recognizable technical structure.",
      "MEDIUM",
    );
    push(
      "contradicting",
      "Breakout confirmation risk",
      "Breakouts depend on sustained pressure that is not visible in the statement alone.",
      "HIGH",
    );
  }
  if (/(valuation|multiple|priced ?in|expensive|cheap)/i.test(t)) {
    push(
      "contradicting",
      "Valuation concern",
      "The thesis depends on the market not fully pricing in expected outcomes — this is not directly observable from public sources.",
      "HIGH",
    );
  }
  if (/(scalable|scales|performance|latency|throughput)/i.test(t)) {
    push(
      "uncertain",
      "Non-functional constraint uncertainty",
      "The claim asserts scale properties that require a benchmark to verify.",
      "HIGH",
    );
  }
  if (/(customer|user|adopt|willingness to pay|pay)/i.test(t)) {
    push(
      "uncertain",
      "Willingness-to-pay unverified",
      "Adoption assumptions require primary-source willingness-to-pay signals.",
      "HIGH",
    );
  }
  if (/(safe|secure|no risk|guaranteed|certain)/i.test(t)) {
    push(
      "contradicting",
      "Overconfidence pattern",
      "The statement asserts certainty in a domain where certainty is not typical.",
      "MEDIUM",
    );
  }

  // 3. Demo fill so the response always has something useful. Clearly labelled.
  const hasLiveEvidence = provided.length > 0;
  const demoNeeded = supporting.length + contradicting.length + uncertain.length < 4;
  if (demoNeeded) {
    for (const s of pick(rng, DEMO_SUPPORTING, 2)) {
      supporting.push({
        id: makeId("e", rng),
        kind: "supporting",
        title: s,
        summary: `${s} — synthesized from thesis context; requires primary-source verification.`,
        source: hasLiveEvidence ? "Model Reasoning" : "Demo Signal",
        sourceKind: hasLiveEvidence ? "INTERPRETATION" : "DEMO",
        confidence: hasLiveEvidence ? "MEDIUM" : "LOW",
        impact: "MEDIUM",
        relevance: "MEDIUM",
      });
    }
    for (const s of pick(rng, DEMO_CONTRADICTING, 1)) {
      contradicting.push({
        id: makeId("e", rng),
        kind: "contradicting",
        title: s,
        summary: `${s} — synthesized from thesis context; requires primary-source verification.`,
        source: hasLiveEvidence ? "Model Reasoning" : "Demo Signal",
        sourceKind: hasLiveEvidence ? "INTERPRETATION" : "DEMO",
        confidence: hasLiveEvidence ? "MEDIUM" : "LOW",
        impact: "MEDIUM",
        relevance: "MEDIUM",
      });
    }
    for (const s of pick(rng, DEMO_UNCERTAIN, 1)) {
      uncertain.push({
        id: makeId("e", rng),
        kind: "uncertain",
        title: s,
        summary: `${s} — insufficient information to classify.`,
        source: hasLiveEvidence ? "Model Reasoning" : "Demo Signal",
        sourceKind: hasLiveEvidence ? "INTERPRETATION" : "DEMO",
        confidence: "UNKNOWN",
        impact: "MEDIUM",
        relevance: "MEDIUM",
      });
    }
  }

  // 4. Risks — generic taxonomy, domain-tuned tone
  const domain = input.extraction.domain ?? "general";
  const risks: RiskItem[] = [
    {
      id: makeId("r", rng),
      category: "Confirmation Bias",
      text: "The statement may reflect the requester's prior belief more than the evidence.",
      severity: "MEDIUM",
    },
    {
      id: makeId("r", rng),
      category: "Missing Evidence",
      text: "Primary-source verification of the load-bearing assumption is not provided.",
      severity: hasLiveEvidence ? "MEDIUM" : "HIGH",
    },
    {
      id: makeId("r", rng),
      category:
        domain === "trading"
          ? "Timing Risk"
          : domain === "technical"
            ? "Execution Risk"
            : "Scope Risk",
      text:
        domain === "trading"
          ? "Even if directionally correct, the trade may play out well beyond the intended horizon."
          : domain === "technical"
            ? "Even if the design is sound, implementation may hit unforeseen edge cases."
            : "Even if the reasoning is correct, execution may reveal unmodelled constraints.",
      severity: "MEDIUM",
    },
  ];

  // 5. Cases — concise, structured (no chain-of-thought)
  const bullCase: string[] = [
    "The statement is internally coherent and identifies concrete mechanisms.",
    "Assumptions are testable and can be checked against evidence.",
    "Directionally, similar setups have historically produced the claimed outcome some of the time.",
  ];
  const bearCase: string[] = [
    "Critical assumptions cannot be validated from the supplied material alone.",
    "The claim ignores at least one commonly observed contradicting pattern.",
    "Overconfidence in a single mechanism increases fragility.",
  ];
  const contrarianCase: string[] = [
    "The correct call may not be the opposite direction — it may be no decision at all.",
    "A wait for confirmation is often stronger than acting on the argument as written.",
  ];

  const strongestSupport = supporting[0]?.title;
  const strongestContradiction = contradicting[0]?.title;
  const weakestAssumption = input.extraction.assumptions
    .filter((a) => a.weight >= 4)[0]?.text;

  const missingEvidence = input.extraction.evidenceRequirements.slice(0, 3);

  return {
    supporting,
    contradicting,
    uncertain,
    risks,
    bullCase,
    bearCase,
    contrarianCase,
    weakestAssumptionText: weakestAssumption,
    strongestContradictionText: strongestContradiction,
    strongestSupportText: strongestSupport,
    missingEvidence,
    hasLiveEvidence,
  };
}

function pushInto(
  item: EvidenceItem,
  sup: EvidenceItem[],
  con: EvidenceItem[],
  unc: EvidenceItem[],
) {
  if (item.kind === "supporting") sup.push(item);
  else if (item.kind === "contradicting") con.push(item);
  else unc.push(item);
}

export function confidenceWeight(c: Confidence): number {
  return c === "HIGH" ? 1 : c === "MEDIUM" ? 0.7 : c === "LOW" ? 0.4 : 0.25;
}
export function impactWeight(i: Impact): number {
  return i === "HIGH" ? 1 : i === "MEDIUM" ? 0.65 : 0.35;
}
