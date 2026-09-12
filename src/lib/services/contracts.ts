/**
 * Service contracts: request/response types, JSON Schemas, and strict
 * deterministic validation.
 *
 * One schema source. The JSON Schemas published in the SharedNet manifest, the
 * MCP tool definitions, and the SharedOS `ToolDefinition.inputSchema` are all
 * read from here, so a discovering agent and the kernel can never disagree
 * about what a service accepts.
 *
 * Validation is hand-rolled and total: it never throws, and every rejection
 * carries a stable machine-readable code.
 */

import type { ServiceName } from "../arena/config";
import type { DecisionDomain } from "../decision/types";

// ---------------------------------------------------------------- error codes

export type ErrorCode =
  | "invalid_payload"
  | "missing_field"
  | "invalid_type"
  | "field_too_long"
  | "field_too_short"
  | "too_many_items"
  | "unsupported_domain"
  | "unknown_field"
  | "unknown_service"
  | "unauthorized"
  | "timeout"
  | "internal_error";

export interface ServiceError {
  code: ErrorCode;
  message: string;
  field?: string;
}

export interface ServiceFailure {
  success: false;
  error: ServiceError;
  service?: ServiceName;
  request_id?: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ServiceError };

// ------------------------------------------------------------------- requests

export interface PreviewRequest {
  thesis: string;
  domain?: DecisionDomain;
}

export interface VerifyClaimRequest {
  claim: string;
  context?: string;
  evidence?: string[];
  sources?: string[];
}

export interface BreakThesisRequest {
  thesis: string;
  context?: string;
  evidence?: string[];
  sources?: string[];
  constraints?: string[];
  objective?: string;
  domain?: DecisionDomain;
}

// -------------------------------------------------------------------- limits

export const LIMITS = {
  free_preview: { thesis: { min: 5, max: 600 } },
  verify_claim: {
    claim: { min: 3, max: 2_000 },
    context: 2_000,
    evidence: { maxItems: 16, maxLen: 2_000 },
    sources: { maxItems: 16, maxLen: 500 },
  },
  break_thesis: {
    thesis: { min: 5, max: 4_000 },
    context: 4_000,
    evidence: { maxItems: 32, maxLen: 2_000 },
    sources: { maxItems: 32, maxLen: 500 },
    constraints: { maxItems: 16, maxLen: 500 },
    objective: 500,
  },
} as const;

export const DOMAINS: readonly DecisionDomain[] = [
  "trading",
  "business",
  "technical",
  "research",
  "strategic",
  "factual",
  "product",
  "general",
];

// ---------------------------------------------------------------- primitives

function fail(code: ErrorCode, message: string, field?: string): { ok: false; error: ServiceError } {
  return { ok: false, error: { code, message, ...(field ? { field } : {}) } };
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function readString(
  source: Record<string, unknown>,
  field: string,
  opts: { min?: number; max: number; required?: boolean },
): ValidationResult<string | undefined> {
  const value = source[field];
  if (value === undefined || value === null) {
    if (opts.required) return fail("missing_field", `\`${field}\` is required`, field);
    return { ok: true, value: undefined };
  }
  if (typeof value !== "string") {
    return fail("invalid_type", `\`${field}\` must be a string`, field);
  }
  const trimmed = value.trim();
  if (opts.required && trimmed.length === 0) {
    return fail("missing_field", `\`${field}\` must not be empty`, field);
  }
  if (opts.min !== undefined && trimmed.length > 0 && trimmed.length < opts.min) {
    return fail("field_too_short", `\`${field}\` must be at least ${opts.min} characters`, field);
  }
  if (value.length > opts.max) {
    return fail("field_too_long", `\`${field}\` exceeds ${opts.max} characters`, field);
  }
  return { ok: true, value: trimmed.length > 0 ? trimmed : undefined };
}

function readStringArray(
  source: Record<string, unknown>,
  field: string,
  opts: { maxItems: number; maxLen: number },
): ValidationResult<string[] | undefined> {
  const value = source[field];
  if (value === undefined || value === null) return { ok: true, value: undefined };
  if (!Array.isArray(value)) {
    return fail("invalid_type", `\`${field}\` must be an array of strings`, field);
  }
  if (value.length > opts.maxItems) {
    return fail("too_many_items", `\`${field}\` accepts at most ${opts.maxItems} items`, field);
  }
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      return fail("invalid_type", `\`${field}\` must contain only strings`, field);
    }
    if (item.length > opts.maxLen) {
      return fail("field_too_long", `\`${field}\` items exceed ${opts.maxLen} characters`, field);
    }
    const trimmed = item.trim();
    if (trimmed.length > 0) out.push(trimmed);
  }
  return { ok: true, value: out.length > 0 ? out : undefined };
}

function readDomain(source: Record<string, unknown>): ValidationResult<DecisionDomain | undefined> {
  const value = source.domain;
  if (value === undefined || value === null) return { ok: true, value: undefined };
  if (typeof value !== "string") {
    return fail("invalid_type", "`domain` must be a string", "domain");
  }
  if (!DOMAINS.includes(value as DecisionDomain)) {
    return fail(
      "unsupported_domain",
      `\`domain\` must be one of: ${DOMAINS.join(", ")}`,
      "domain",
    );
  }
  return { ok: true, value: value as DecisionDomain };
}

function rejectUnknown(
  source: Record<string, unknown>,
  allowed: readonly string[],
): ServiceError | null {
  for (const key of Object.keys(source)) {
    if (!allowed.includes(key)) {
      return {
        code: "unknown_field",
        message: `unknown field \`${key}\`; accepted fields are: ${allowed.join(", ")}`,
        field: key,
      };
    }
  }
  return null;
}

// ------------------------------------------------------------------ validators

export function validatePreviewRequest(raw: unknown): ValidationResult<PreviewRequest> {
  const source = asRecord(raw);
  if (!source) return fail("invalid_payload", "request body must be a JSON object");

  const allowed = ["thesis", "statement", "domain"];
  const unknown = rejectUnknown(source, allowed);
  if (unknown) return { ok: false, error: unknown };

  // `statement` is accepted as an alias so an agent that already speaks the
  // internal vocabulary is not rejected on a naming detail.
  const normalized = { ...source, thesis: source.thesis ?? source.statement };
  const thesis = readString(normalized, "thesis", {
    required: true,
    min: LIMITS.free_preview.thesis.min,
    max: LIMITS.free_preview.thesis.max,
  });
  if (!thesis.ok) return thesis;

  const domain = readDomain(source);
  if (!domain.ok) return domain;

  return {
    ok: true,
    value: { thesis: thesis.value as string, ...(domain.value ? { domain: domain.value } : {}) },
  };
}

export function validateVerifyClaimRequest(raw: unknown): ValidationResult<VerifyClaimRequest> {
  const source = asRecord(raw);
  if (!source) return fail("invalid_payload", "request body must be a JSON object");

  const allowed = ["claim", "context", "evidence", "sources"];
  const unknown = rejectUnknown(source, allowed);
  if (unknown) return { ok: false, error: unknown };

  const claim = readString(source, "claim", {
    required: true,
    min: LIMITS.verify_claim.claim.min,
    max: LIMITS.verify_claim.claim.max,
  });
  if (!claim.ok) return claim;

  const context = readString(source, "context", { max: LIMITS.verify_claim.context });
  if (!context.ok) return context;

  const evidence = readStringArray(source, "evidence", LIMITS.verify_claim.evidence);
  if (!evidence.ok) return evidence;

  const sources = readStringArray(source, "sources", LIMITS.verify_claim.sources);
  if (!sources.ok) return sources;

  return {
    ok: true,
    value: {
      claim: claim.value as string,
      ...(context.value ? { context: context.value } : {}),
      ...(evidence.value ? { evidence: evidence.value } : {}),
      ...(sources.value ? { sources: sources.value } : {}),
    },
  };
}

export function validateBreakThesisRequest(raw: unknown): ValidationResult<BreakThesisRequest> {
  const source = asRecord(raw);
  if (!source) return fail("invalid_payload", "request body must be a JSON object");

  const allowed = [
    "thesis",
    "statement",
    "context",
    "evidence",
    "sources",
    "constraints",
    "objective",
    "domain",
  ];
  const unknown = rejectUnknown(source, allowed);
  if (unknown) return { ok: false, error: unknown };

  const normalized = { ...source, thesis: source.thesis ?? source.statement };
  const thesis = readString(normalized, "thesis", {
    required: true,
    min: LIMITS.break_thesis.thesis.min,
    max: LIMITS.break_thesis.thesis.max,
  });
  if (!thesis.ok) return thesis;

  const context = readString(source, "context", { max: LIMITS.break_thesis.context });
  if (!context.ok) return context;

  const objective = readString(source, "objective", { max: LIMITS.break_thesis.objective });
  if (!objective.ok) return objective;

  const evidence = readStringArray(source, "evidence", LIMITS.break_thesis.evidence);
  if (!evidence.ok) return evidence;

  const sources = readStringArray(source, "sources", LIMITS.break_thesis.sources);
  if (!sources.ok) return sources;

  const constraints = readStringArray(source, "constraints", LIMITS.break_thesis.constraints);
  if (!constraints.ok) return constraints;

  const domain = readDomain(source);
  if (!domain.ok) return domain;

  return {
    ok: true,
    value: {
      thesis: thesis.value as string,
      ...(context.value ? { context: context.value } : {}),
      ...(objective.value ? { objective: objective.value } : {}),
      ...(evidence.value ? { evidence: evidence.value } : {}),
      ...(sources.value ? { sources: sources.value } : {}),
      ...(constraints.value ? { constraints: constraints.value } : {}),
      ...(domain.value ? { domain: domain.value } : {}),
    },
  };
}

export const VALIDATORS: {
  [K in ServiceName]: (raw: unknown) => ValidationResult<unknown>;
} = {
  free_preview: validatePreviewRequest,
  verify_claim: validateVerifyClaimRequest,
  break_thesis: validateBreakThesisRequest,
};
