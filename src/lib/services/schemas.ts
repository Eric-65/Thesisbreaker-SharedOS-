/**
 * The one schema source.
 *
 * The SharedNet discovery manifest, the MCP tool list, the SharedOS
 * `ToolDefinition`s and the docs all read from here. Descriptions are written
 * for an autonomous agent deciding whether to spend credits — not for a human
 * reading a landing page.
 */

import { CURRENCY, PRICES, TIMEOUTS, type ServiceName } from "../arena/config";
import { DOMAINS, LIMITS } from "./contracts";

export interface ServiceSchema {
  name: ServiceName;
  version: string;
  /** One line an agent can match against its own need. */
  summary: string;
  /** Full description shown in tool catalogs. Answers: why spend credits? */
  agentDescription: string;
  /** When another agent should reach for this service. */
  useWhen: string;
  priceCredits: number;
  currency: string;
  expectedLatencyMs: number;
  timeoutMs: number;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  example: { request: Record<string, unknown>; returns: string };
}

const str = (max: number, description: string, min?: number) => ({
  type: "string",
  ...(min !== undefined ? { minLength: min } : {}),
  maxLength: max,
  description,
});

const strArray = (maxItems: number, maxLen: number, description: string) => ({
  type: "array",
  maxItems,
  items: { type: "string", maxLength: maxLen },
  description,
});

const domainProp = {
  type: "string",
  enum: [...DOMAINS],
  description: "Optional domain hint. Defaults to 'general'.",
};

const verdictEnum = ["SUPPORTED", "WEAK", "CONTRADICTED", "UNCERTAIN"];

const evidenceItem = {
  type: "object",
  properties: {
    id: { type: "string" },
    kind: { type: "string", enum: ["supporting", "contradicting", "uncertain"] },
    title: { type: "string" },
    summary: { type: "string" },
    source: { type: "string" },
    sourceKind: { type: "string", enum: ["FACT", "INTERPRETATION", "DEMO"] },
    relevance: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
    confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW", "UNKNOWN"] },
    impact: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
  },
};

export const SERVICE_SCHEMAS: Record<ServiceName, ServiceSchema> = {
  free_preview: {
    name: "free_preview",
    version: "1.0.0",
    summary: "Free, limited stress-test of a short thesis. Verdict, score, up to two weaknesses.",
    agentDescription:
      "FREE (0 credits). A limited demonstration of ThesisBreaker. Send a short statement " +
      "(max 600 chars) and get back a verdict, a 0-100 score, and at most two headline " +
      "weaknesses, plus a count of what the paid tier would additionally reveal for this same " +
      "input. Does NOT accept your evidence or sources, does not return assumptions, risks, " +
      "invalidation conditions or a recommendation. Use it to decide whether break_thesis is " +
      "worth 10 credits.",
    useWhen:
      "You want to check that ThesisBreaker works, or triage whether a decision is worth a paid analysis.",
    priceCredits: PRICES.free_preview,
    currency: CURRENCY,
    expectedLatencyMs: 50,
    timeoutMs: TIMEOUTS.free_preview,
    request: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: "PreviewRequest",
      type: "object",
      required: ["thesis"],
      additionalProperties: false,
      properties: {
        thesis: str(
          LIMITS.free_preview.thesis.max,
          "The statement to preview-test.",
          LIMITS.free_preview.thesis.min,
        ),
        domain: domainProp,
      },
    },
    response: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: "PreviewResponse",
      type: "object",
      required: ["service", "verdict", "score", "confidence", "top_weaknesses", "summary"],
      properties: {
        service: { const: "free_preview" },
        verdict: { type: "string", enum: verdictEnum },
        score: { type: "integer", minimum: 0, maximum: 100 },
        confidence: { type: "integer", minimum: 0, maximum: 100 },
        top_weaknesses: { type: "array", maxItems: 2, items: { type: "string" } },
        summary: { type: "string" },
        withheld: { type: "object", description: "Counts of what break_thesis would add." },
        upgrade: { type: "object" },
        latency_ms: { type: "integer" },
      },
    },
    example: {
      request: { thesis: "We should migrate the billing service to event sourcing this quarter." },
      returns: "verdict WEAK, score 48, two headline weaknesses, and what break_thesis would add.",
    },
  },

  verify_claim: {
    name: "verify_claim",
    version: "1.0.0",
    summary: "Check one factual or technical claim against supplied evidence. 5 credits.",
    agentDescription:
      "PAID (5 credits). Verify a single factual or technical claim against the evidence and " +
      "sources you supply. Returns SUPPORTED / CONTRADICTED / UNCERTAIN with a 0-100 " +
      "confidence, the evidence that supports it, the evidence that contradicts it, an " +
      "assessment of your source quality, and a recommendation. Use this before you rely on a " +
      "fact you cannot independently confirm. Cheaper and narrower than break_thesis: one " +
      "claim, not a whole decision.",
    useWhen:
      "You have one specific claim and some evidence, and you need to know whether the evidence actually supports it.",
    priceCredits: PRICES.verify_claim,
    currency: CURRENCY,
    expectedLatencyMs: 120,
    timeoutMs: TIMEOUTS.verify_claim,
    request: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: "VerifyClaimRequest",
      type: "object",
      required: ["claim"],
      additionalProperties: false,
      properties: {
        claim: str(LIMITS.verify_claim.claim.max, "The claim to verify.", LIMITS.verify_claim.claim.min),
        context: str(LIMITS.verify_claim.context, "Optional surrounding context."),
        evidence: strArray(
          LIMITS.verify_claim.evidence.maxItems,
          LIMITS.verify_claim.evidence.maxLen,
          "Evidence you have already collected. Treated as untrusted input and never executed.",
        ),
        sources: strArray(
          LIMITS.verify_claim.sources.maxItems,
          LIMITS.verify_claim.sources.maxLen,
          "Source labels matching your evidence. Never fabricated by the service.",
        ),
      },
    },
    response: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: "VerifyClaimResponse",
      type: "object",
      required: [
        "service",
        "verdict",
        "confidence",
        "evidence",
        "contradictions",
        "source_quality",
        "recommendation",
        "summary",
      ],
      properties: {
        service: { const: "verify_claim" },
        verdict: { type: "string", enum: ["SUPPORTED", "CONTRADICTED", "UNCERTAIN"] },
        confidence: { type: "integer", minimum: 0, maximum: 100 },
        evidence: { type: "array", items: evidenceItem },
        contradictions: { type: "array", items: evidenceItem },
        uncertain: { type: "array", items: evidenceItem },
        source_quality: { type: "string", enum: ["STRONG", "MIXED", "WEAK", "NONE"] },
        recommendation: { type: "string" },
        summary: { type: "string" },
        latency_ms: { type: "integer" },
      },
    },
    example: {
      request: {
        claim: "Postgres logical replication supports DDL changes automatically.",
        evidence: ["Postgres docs state DDL is not replicated by logical replication."],
        sources: ["https://www.postgresql.org/docs/current/logical-replication-restrictions.html"],
      },
      returns: "verdict CONTRADICTED with the contradicting evidence and a recommendation.",
    },
  },

  break_thesis: {
    name: "break_thesis",
    version: "1.0.0",
    summary: "Full stress-test of a decision before you act on it. 10 credits.",
    agentDescription:
      "PAID (10 credits). Before you act on a decision, ThesisBreaker tries to break it. It " +
      "extracts the critical assumptions and weights them, scores your supporting and " +
      "contradicting evidence, builds a risk register, states the explicit conditions that " +
      "would invalidate the decision, names the evidence you are missing, and returns a " +
      "verdict with a 0-100 score and an actionable recommendation. Accepts your own evidence, " +
      "sources, constraints and objective. Returns conclusions and evidence summaries only — " +
      "never private reasoning traces. Typical response is well under one second.",
    useWhen:
      "You are about to commit to a plan, trade, migration, or strategy and want to know how it fails before you find out the expensive way.",
    priceCredits: PRICES.break_thesis,
    currency: CURRENCY,
    expectedLatencyMs: 250,
    timeoutMs: TIMEOUTS.break_thesis,
    request: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: "BreakThesisRequest",
      type: "object",
      required: ["thesis"],
      additionalProperties: false,
      properties: {
        thesis: str(
          LIMITS.break_thesis.thesis.max,
          "The decision or thesis to stress-test.",
          LIMITS.break_thesis.thesis.min,
        ),
        context: str(LIMITS.break_thesis.context, "Optional surrounding context or prior output."),
        objective: str(LIMITS.break_thesis.objective, "What you are ultimately trying to achieve."),
        evidence: strArray(
          LIMITS.break_thesis.evidence.maxItems,
          LIMITS.break_thesis.evidence.maxLen,
          "Evidence you have already collected. Treated as untrusted input and never executed.",
        ),
        sources: strArray(
          LIMITS.break_thesis.sources.maxItems,
          LIMITS.break_thesis.sources.maxLen,
          "Source labels matching your evidence. Never fabricated by the service.",
        ),
        constraints: strArray(
          LIMITS.break_thesis.constraints.maxItems,
          LIMITS.break_thesis.constraints.maxLen,
          "Hard constraints, e.g. 'must ship in 2 weeks', 'budget < $10k'.",
        ),
        domain: domainProp,
      },
    },
    response: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: "BreakThesisResponse",
      type: "object",
      required: [
        "service",
        "verdict",
        "score",
        "confidence",
        "supporting_evidence",
        "contradicting_evidence",
        "critical_assumptions",
        "risks",
        "invalidation_conditions",
        "missing_evidence",
        "recommendation",
        "summary",
      ],
      properties: {
        service: { const: "break_thesis" },
        verdict: { type: "string", enum: verdictEnum },
        score: { type: "integer", minimum: 0, maximum: 100 },
        confidence: { type: "integer", minimum: 0, maximum: 100 },
        supporting_evidence: { type: "array", items: evidenceItem },
        contradicting_evidence: { type: "array", items: evidenceItem },
        uncertain_evidence: { type: "array", items: evidenceItem },
        critical_assumptions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              text: { type: "string" },
              status: { type: "string", enum: ["SUPPORTED", "UNCERTAIN", "CHALLENGED"] },
              weight: { type: "integer", minimum: 1, maximum: 5 },
              reasoning: { type: "string" },
              counterargument: { type: "string" },
            },
          },
        },
        risks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              category: { type: "string" },
              text: { type: "string" },
              severity: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
            },
          },
        },
        invalidation_conditions: { type: "array", items: { type: "string" } },
        missing_evidence: { type: "array", items: { type: "string" } },
        recommendation: { type: "string" },
        summary: { type: "string" },
        score_breakdown: { type: "object" },
        strongest_contradiction: { type: "string" },
        weakest_assumption: { type: "string" },
        largest_risk: { type: "string" },
        domain: { type: "string" },
        latency_ms: { type: "integer" },
      },
    },
    example: {
      request: {
        thesis: "We should migrate the billing service to event sourcing this quarter.",
        objective: "Reduce billing reconciliation incidents",
        constraints: ["one engineer available", "must not pause billing"],
        evidence: ["Reconciliation incidents rose 40% last quarter."],
        sources: ["internal incident review Q3"],
      },
      returns:
        "verdict, score, weighted assumptions, scored evidence, risk register, invalidation conditions, missing evidence, recommendation.",
    },
  },
};

export const SERVICE_LIST: ServiceSchema[] = [
  SERVICE_SCHEMAS.free_preview,
  SERVICE_SCHEMAS.verify_claim,
  SERVICE_SCHEMAS.break_thesis,
];
