/**
 * Service registry — the machine-readable catalog ThesisBreaker publishes to
 * SharedNet. Each entry is fully serializable and includes an input/output
 * JSON schema so a discovering agent can call the service without human help.
 *
 * The `purpose` string is applied consistently across service execution and
 * audit logging.
 */

export const PURPOSE = "thesisbreaker.verify";

export type ServiceName = "break_thesis" | "verify_claim";

export interface ServiceSpec {
  name: ServiceName;
  version: string;
  description: string;
  priceCredits: number;
  expectedLatencyMs: number;
  timeoutMs: number;
  purpose: string;
  permissions: {
    allowed: string[];
    denied: string[];
  };
  request: unknown; // JSON schema
  response: unknown; // JSON schema
  invocation: {
    method: "POST";
    path: string;
    contentType: "application/json";
  };
}

const BREAK_THESIS_REQUEST_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "BreakThesisRequest",
  type: "object",
  required: ["thesis"],
  additionalProperties: false,
  properties: {
    thesis: {
      type: "string",
      minLength: 5,
      maxLength: 4000,
      description: "The decision or thesis statement to stress-test.",
    },
    context: {
      type: "string",
      maxLength: 4000,
      description: "Optional surrounding context, objective, or prior turn output.",
    },
    evidence: {
      type: "array",
      items: { type: "string", maxLength: 2000 },
      maxItems: 32,
      description:
        "Optional pre-collected evidence strings. Stored verbatim as FACT-labelled evidence — the service never verifies or fabricates these.",
    },
    sources: {
      type: "array",
      items: { type: "string", maxLength: 500 },
      maxItems: 32,
      description: "Optional matching source labels (URLs, doc ids). Never fabricated by the service.",
    },
    domain: {
      type: "string",
      enum: [
        "trading",
        "business",
        "technical",
        "research",
        "strategic",
        "factual",
        "product",
        "general",
      ],
      description: "Optional domain hint. Defaults to 'general'.",
    },
    constraints: {
      type: "array",
      items: { type: "string", maxLength: 500 },
      maxItems: 16,
    },
    objective: { type: "string", maxLength: 500 },
  },
} as const;

const BREAK_THESIS_RESPONSE_SCHEMA = {
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
    "score_breakdown",
    "latency_ms",
    "demo",
  ],
  properties: {
    service: { const: "break_thesis" },
    verdict: { enum: ["SUPPORTED", "WEAK", "CONTRADICTED", "UNCERTAIN"] },
    score: { type: "integer", minimum: 0, maximum: 100 },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    supporting_evidence: { type: "array" },
    contradicting_evidence: { type: "array" },
    uncertain_evidence: { type: "array" },
    critical_assumptions: { type: "array" },
    risks: { type: "array" },
    invalidation_conditions: { type: "array", items: { type: "string" } },
    missing_evidence: { type: "array", items: { type: "string" } },
    recommendation: { type: "string" },
    summary: { type: "string" },
    score_breakdown: { type: "object" },
    bull_case: { type: "array", items: { type: "string" } },
    bear_case: { type: "array", items: { type: "string" } },
    contrarian_case: { type: "array", items: { type: "string" } },
    strongest_contradiction: { type: "string" },
    weakest_assumption: { type: "string" },
    largest_risk: { type: "string" },
    strongest_support: { type: "string" },
    domain: { type: "string" },
    latency_ms: { type: "integer", minimum: 0 },
    demo: { type: "boolean" },
  },
} as const;

const VERIFY_CLAIM_REQUEST_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "VerifyClaimRequest",
  type: "object",
  required: ["claim"],
  additionalProperties: false,
  properties: {
    claim: {
      type: "string",
      minLength: 3,
      maxLength: 2000,
      description: "The claim to verify.",
    },
    context: { type: "string", maxLength: 2000 },
    sources: {
      type: "array",
      items: { type: "string", maxLength: 500 },
      maxItems: 16,
    },
    evidence: {
      type: "array",
      items: { type: "string", maxLength: 2000 },
      maxItems: 16,
    },
  },
} as const;

const VERIFY_CLAIM_RESPONSE_SCHEMA = {
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
    "latency_ms",
    "demo",
  ],
  properties: {
    service: { const: "verify_claim" },
    verdict: { enum: ["SUPPORTED", "CONTRADICTED", "UNCERTAIN"] },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    evidence: { type: "array" },
    contradictions: { type: "array" },
    uncertain: { type: "array" },
    source_quality: { enum: ["STRONG", "MIXED", "WEAK", "NONE"] },
    recommendation: { type: "string" },
    summary: { type: "string" },
    latency_ms: { type: "integer", minimum: 0 },
    demo: { type: "boolean" },
  },
} as const;

const COMMON_PERMISSIONS = {
  allowed: [
    "read:submitted_decision",
    "read:submitted_evidence",
    "invoke:thesisbreaker.reasoning_pipeline",
    "network:public_market_data (optional)",
    "network:public_web_lookup (optional, disabled by default)",
    "return:verification_result",
  ],
  denied: [
    "fs:read",
    "fs:write",
    "network:arbitrary",
    "wallet:*",
    "email:*",
    "process:spawn",
    "system:shell",
    "trade:execute",
    "identity:pii",
    "capabilities:not-listed",
  ],
} as const;

export const SERVICES: ServiceSpec[] = [
  {
    name: "break_thesis",
    version: "1.0.0",
    description:
      "Stress-test a thesis or decision by challenging its assumptions, examining evidence, finding contradictions, identifying risks and invalidation conditions, and returning a structured verdict.",
    priceCredits: 10,
    expectedLatencyMs: 800,
    timeoutMs: 20_000,
    purpose: PURPOSE,
    permissions: { allowed: [...COMMON_PERMISSIONS.allowed], denied: [...COMMON_PERMISSIONS.denied] },
    request: BREAK_THESIS_REQUEST_SCHEMA,
    response: BREAK_THESIS_RESPONSE_SCHEMA,
    invocation: {
      method: "POST",
      path: "/api/agent/services/break_thesis",
      contentType: "application/json",
    },
  },
  {
    name: "verify_claim",
    version: "1.0.0",
    description:
      "Quickly assess whether a claim is supported, contradicted or uncertain based on the supplied evidence and permitted research capabilities.",
    priceCredits: 5,
    expectedLatencyMs: 400,
    timeoutMs: 10_000,
    purpose: PURPOSE,
    permissions: { allowed: [...COMMON_PERMISSIONS.allowed], denied: [...COMMON_PERMISSIONS.denied] },
    request: VERIFY_CLAIM_REQUEST_SCHEMA,
    response: VERIFY_CLAIM_RESPONSE_SCHEMA,
    invocation: {
      method: "POST",
      path: "/api/agent/services/verify_claim",
      contentType: "application/json",
    },
  },
];

export function getService(name: string): ServiceSpec | undefined {
  return SERVICES.find((s) => s.name === name);
}

/** Serializable manifest suitable for SharedNet discovery. */
export function manifest(publicBaseUrl?: string) {
  return {
    product: "ThesisBreaker",
    tagline: "Break a decision before an agent acts on it.",
    purpose: PURPOSE,
    permissions_model: "deny-by-default",
    services: SERVICES.map((s) => ({
      name: s.name,
      version: s.version,
      description: s.description,
      price_credits: s.priceCredits,
      expected_latency_ms: s.expectedLatencyMs,
      timeout_ms: s.timeoutMs,
      purpose: s.purpose,
      permissions: s.permissions,
      request_schema: s.request,
      response_schema: s.response,
      endpoint: publicBaseUrl
        ? `${publicBaseUrl.replace(/\/$/, "")}${s.invocation.path}`
        : s.invocation.path,
      method: s.invocation.method,
      content_type: s.invocation.contentType,
    })),
  };
}
