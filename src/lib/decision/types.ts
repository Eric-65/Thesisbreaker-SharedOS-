/**
 * Generalized decision-verification types. The Arena product accepts any
 * DECISION or THESIS request — trading, business, research, technical,
 * strategic, or factual — and returns a structured verdict. The existing
 * trading pipeline is one specialization, not the whole product.
 */

/** Broad category so downstream engines can adapt tone / templates. */
export type DecisionDomain =
  | "trading"
  | "business"
  | "technical"
  | "research"
  | "strategic"
  | "factual"
  | "product"
  | "general";

/** The verdict axis for the general decision-verification service. */
export type DecisionVerdict =
  | "SUPPORTED"
  | "WEAK"
  | "CONTRADICTED"
  | "UNCERTAIN";

/** Verify-claim verdict — a narrower 3-way. */
export type ClaimVerdict = "SUPPORTED" | "CONTRADICTED" | "UNCERTAIN";

/** Assumption evaluation status (reused from the trading pipeline). */
export type AssumptionStatus = "SUPPORTED" | "UNCERTAIN" | "CHALLENGED";

export type EvidenceKind = "supporting" | "contradicting" | "uncertain";

export type Confidence = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

export type Impact = "LOW" | "MEDIUM" | "HIGH";

export type Severity = "LOW" | "MEDIUM" | "HIGH";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface DecisionRequest {
  /** The claim, thesis or decision statement being verified. */
  statement: string;
  /** Optional context — surrounding situation, objective the agent is pursuing, prior turn output. */
  context?: string;
  /** Optional evidence the calling agent has already collected (strings, snippets, URLs). */
  evidence?: string[];
  /** Optional source labels (URLs, doc ids, dataset names) — never fabricated. */
  sources?: string[];
  /** Optional domain hint. */
  domain?: DecisionDomain;
  /** Optional constraints ("must complete in 2 weeks", "budget < $10k", "GPU RAM 24GB", ...). */
  constraints?: string[];
  /** Optional objective the requester is trying to achieve. */
  objective?: string;
}

export interface Assumption {
  id: string;
  text: string;
  status: AssumptionStatus;
  weight: number; // 1-5
  reasoning: string;
  evidence?: string;
  counterargument?: string;
  impact?: Impact;
}

export interface EvidenceItem {
  id: string;
  kind: EvidenceKind;
  title: string;
  summary: string;
  source: string;
  sourceKind: "FACT" | "INTERPRETATION" | "DEMO";
  publishedAt?: string;
  relevance: Impact;
  confidence: Confidence;
  impact: Impact;
}

export interface RiskItem {
  id: string;
  category: string;
  text: string;
  severity: Severity;
}

export interface ScoreBreakdown {
  evidence: { earned: number; max: 25 };
  assumptions: { earned: number; max: 25 };
  contradictions: { earned: number; max: 20 };
  risk: { earned: number; max: 15 };
  invalidation: { earned: number; max: 15 };
  total: number;
}

export interface BreakThesisResult {
  service: "break_thesis";
  verdict: DecisionVerdict;
  score: number; // 0-100
  confidence: number; // 0-100
  supporting_evidence: EvidenceItem[];
  contradicting_evidence: EvidenceItem[];
  uncertain_evidence: EvidenceItem[];
  critical_assumptions: Assumption[];
  risks: RiskItem[];
  invalidation_conditions: string[];
  missing_evidence: string[];
  recommendation: string;
  summary: string;
  score_breakdown: ScoreBreakdown;
  /** Structured trace for the Break Card / UI. Never chain-of-thought. */
  bull_case?: string[];
  bear_case?: string[];
  contrarian_case?: string[];
  strongest_contradiction?: string;
  weakest_assumption?: string;
  largest_risk?: string;
  strongest_support?: string;
  domain: DecisionDomain;
  latency_ms: number;
  demo: boolean;
}

export interface VerifyClaimResult {
  service: "verify_claim";
  verdict: ClaimVerdict;
  confidence: number; // 0-100
  evidence: EvidenceItem[];
  contradictions: EvidenceItem[];
  uncertain: EvidenceItem[];
  source_quality: "STRONG" | "MIXED" | "WEAK" | "NONE";
  recommendation: string;
  summary: string;
  latency_ms: number;
  demo: boolean;
}
