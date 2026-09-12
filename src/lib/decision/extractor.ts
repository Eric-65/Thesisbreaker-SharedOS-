import type { Assumption, DecisionRequest } from "./types";
import { seededRng, id as makeId } from "../agents/rand";

/**
 * DecisionExtractor
 *
 * Domain-agnostic thesis extractor. Turns any statement into:
 *   - core claim
 *   - critical assumptions
 *   - candidate invalidation conditions
 *   - evidence requirements (what evidence would confirm or break it)
 *   - domain-appropriate signals
 *
 * Deterministic; produces the same output for the same input so callers can
 * cache/replay. Designed to be swapped for an LLM-backed extractor without
 * changing the pipeline signature.
 */

const ASSUMPTION_TEMPLATES: {
  match: RegExp;
  text: (subject: string) => string;
  weight: number;
}[] = [
  {
    match: /(will|should|is going to|expected to|likely to)\s+(rise|grow|expand|increase|outperform|break out|break)/i,
    text: () =>
      "The upward move materializes within the stated horizon rather than reversing.",
    weight: 5,
  },
  {
    match: /(will|should|is going to|expected to)\s+(fall|drop|decline|underperform|reverse|crash)/i,
    text: () =>
      "The downward move materializes within the stated horizon rather than recovering.",
    weight: 5,
  },
  {
    match: /(momentum|trend|volume|breakout|resistance|support)/i,
    text: (s) =>
      `Technical structure of ${s} continues to confirm the setup.`,
    weight: 4,
  },
  {
    match: /(competition|competitor|moat|market share)/i,
    text: (s) => `${s} maintains its competitive positioning against alternatives.`,
    weight: 4,
  },
  {
    match: /(margin|pricing|profitability|unit economics)/i,
    text: (s) => `${s} preserves pricing power / gross margin.`,
    weight: 4,
  },
  {
    match: /(revenue|growth|customers|users|adoption|demand)/i,
    text: (s) => `${s} continues its stated demand / growth trajectory.`,
    weight: 4,
  },
  {
    match: /(valuation|multiple|price to|priced ?in|expensive|cheap)/i,
    text: () => "Current valuation leaves room for the expected trajectory.",
    weight: 4,
  },
  {
    match: /(regulation|regulator|legal|compliance|law)/i,
    text: () => "Regulatory framework does not materially change during the horizon.",
    weight: 3,
  },
  {
    match: /(macro|inflation|rates|fed|liquidity|recession)/i,
    text: () => "Macro backdrop remains neutral to constructive for the setup.",
    weight: 3,
  },
  {
    match: /(catalyst|launch|announcement|earnings|conference|release)/i,
    text: () => "The identified catalyst materializes within the stated horizon.",
    weight: 4,
  },
  {
    match: /(scalable|scales|architecture|latency|throughput|performance|reliability|uptime)/i,
    text: () => "The technical approach scales as required for the constraints.",
    weight: 4,
  },
  {
    match: /(security|attack|vulnerability|breach)/i,
    text: () => "The proposed approach preserves the required security posture.",
    weight: 4,
  },
  {
    match: /(user|customer|market fit|willingness to pay|adoption)/i,
    text: () => "There is willingness among the target audience to adopt / pay.",
    weight: 4,
  },
];

/** Rough subject noun extraction — heuristic, not NLP. */
function extractSubject(statement: string, fallback: string): string {
  const trimmed = statement.trim();
  // Ticker-shape first token wins
  const t = trimmed.match(/^([A-Z]{2,10}(?:\/[A-Z]{3,5})?)/);
  if (t) return t[1];
  // "I think X will..." → X
  const m = trimmed.match(/(?:i\s+(?:think|believe)|our|the)\s+([A-Z][\w-]+(?:\s+[\w-]+){0,3})/i);
  if (m) return m[1];
  const first = trimmed.split(/[\s.,]/)[0];
  return first || fallback;
}

export interface ExtractedDecision {
  statement: string;
  subject: string;
  domain: DecisionRequest["domain"];
  assumptions: Assumption[];
  invalidations: string[];
  evidenceRequirements: string[];
  hasProvidedEvidence: boolean;
  signals: string[]; // themed keywords the interpretation layer can lean on
}

export function extractDecision(input: DecisionRequest): ExtractedDecision {
  const statement = (input.statement ?? "").trim();
  const context = (input.context ?? "").trim();
  const seed = statement + "|" + (context ?? "") + "|" + (input.domain ?? "");
  const rng = seededRng(seed);
  const subject = extractSubject(statement, "the subject");
  const domain = input.domain ?? "general";

  const combined = [statement, context, ...(input.constraints ?? [])].join(" ");

  // Match assumption templates against the combined text
  const seen = new Set<string>();
  const assumptions: Assumption[] = [];
  for (const tpl of ASSUMPTION_TEMPLATES) {
    if (tpl.match.test(combined)) {
      const text = tpl.text(subject);
      if (seen.has(text)) continue;
      seen.add(text);
      assumptions.push({
        id: makeId("a", rng),
        text,
        weight: tpl.weight,
        status: "UNCERTAIN",
        reasoning: "",
      });
    }
    if (assumptions.length >= 6) break;
  }

  // Domain-agnostic fallbacks so we always have at least three assumptions
  if (assumptions.length < 3) {
    const fallbacks: { t: string; w: number }[] = [];
    if (domain === "trading") {
      fallbacks.push({ t: `${subject} executes without a material operational misstep.`, w: 4 });
      fallbacks.push({ t: "Broad market conditions remain neutral to constructive.", w: 3 });
      fallbacks.push({ t: "Position sizing and stop discipline are respected.", w: 3 });
    } else if (domain === "technical") {
      fallbacks.push({ t: "The proposed approach meets the stated non-functional constraints.", w: 4 });
      fallbacks.push({ t: "Operational cost stays within the implicit budget.", w: 3 });
      fallbacks.push({ t: "The team has the required expertise to execute.", w: 3 });
    } else if (domain === "business" || domain === "strategic" || domain === "product") {
      fallbacks.push({ t: "Target customers experience the problem as described.", w: 4 });
      fallbacks.push({ t: "Distribution to reach those customers is viable.", w: 4 });
      fallbacks.push({ t: "Unit economics support the stated growth path.", w: 4 });
    } else if (domain === "research" || domain === "factual") {
      fallbacks.push({ t: "The cited sources actually support the stated conclusion.", w: 4 });
      fallbacks.push({ t: "The reasoning generalizes beyond the sample it was drawn from.", w: 3 });
      fallbacks.push({ t: "No stronger contradicting sources exist in accessible literature.", w: 4 });
    } else {
      fallbacks.push({ t: "The premises of the statement remain true through the horizon.", w: 4 });
      fallbacks.push({ t: "No material contradicting evidence has been overlooked.", w: 4 });
      fallbacks.push({ t: "The stated recommendation is proportional to the strength of evidence.", w: 3 });
    }
    for (const f of fallbacks) {
      if (assumptions.length >= 4) break;
      assumptions.push({
        id: makeId("a", rng),
        text: f.t,
        weight: f.w,
        status: "UNCERTAIN",
        reasoning: "",
      });
    }
  }

  // Invalidation conditions — domain-tuned
  const invalidations: string[] = [];
  if (domain === "trading") {
    invalidations.push(`${subject} closes decisively against the setup on above-average volume.`);
    invalidations.push("A stated catalyst fails to materialize within the horizon.");
    invalidations.push("Order-book / structure shifts against the direction of the thesis.");
  } else if (domain === "technical") {
    invalidations.push("A benchmark shows the approach does not meet the required non-functional constraint.");
    invalidations.push("A dependency the design relies on becomes unavailable or unsupported.");
    invalidations.push("The team encounters a bug class that cannot be reasonably contained.");
  } else if (domain === "business" || domain === "strategic" || domain === "product") {
    invalidations.push("Willingness-to-pay research contradicts the assumed pricing.");
    invalidations.push("A distribution channel proves ~10× more expensive than modelled.");
    invalidations.push("A competitor releases a strictly superior offering during the horizon.");
  } else if (domain === "research" || domain === "factual") {
    invalidations.push("A higher-quality source directly contradicts the claim.");
    invalidations.push("The cited evidence is shown to be from a biased sample.");
    invalidations.push("A replication attempt fails.");
  } else {
    invalidations.push("Direct contradicting evidence appears in accessible sources.");
    invalidations.push("A stated premise is shown to be false.");
    invalidations.push("A material constraint the statement ignored becomes binding.");
  }

  const evidenceRequirements = [
    "Independent primary-source data on the core claim.",
    "At least one contradicting perspective seriously considered.",
    "A stated invalidation condition tied to observable evidence.",
  ];

  const signals = Array.from(
    new Set(
      combined
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 4),
    ),
  ).slice(0, 24);

  return {
    statement,
    subject,
    domain,
    assumptions,
    invalidations,
    evidenceRequirements,
    hasProvidedEvidence: (input.evidence ?? []).some((e) => (e ?? "").trim().length > 0),
    signals,
  };
}
