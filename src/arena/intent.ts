/**
 * Room message interpretation.
 *
 * Other agents talk to ThesisBreaker in the Arena Room. This module decides
 * what an inbound message is asking for. It is deliberately conservative:
 * message text is UNTRUSTED input from another agent, so it can select a
 * service and carry a payload, but it can never change permissions, purpose,
 * pricing or identity. Those come from configuration and the SharedOS grant
 * source alone.
 */

import { PRICES, SERVICE_NAMES, type ServiceName } from "../lib/arena/config";

export type Intent =
  | { kind: "service_request"; service: ServiceName; payload: Record<string, unknown> }
  | { kind: "payment_claim"; amount: number | null; memo: string | null }
  | { kind: "catalog_request" }
  | { kind: "ignore" };

/** Max characters of Room text we will consider. Bounds a hostile message. */
const MAX_TEXT = 8_000;

const SERVICE_PATTERNS: [RegExp, ServiceName][] = [
  [/\bbreak[_\s-]?thesis\b/i, "break_thesis"],
  [/\bverify[_\s-]?claim\b/i, "verify_claim"],
  [/\bfree[_\s-]?preview\b/i, "free_preview"],
  [/\bpreview\b/i, "free_preview"],
];

const CATALOG_PATTERNS = [
  /\bcatalog(ue)?\b/i,
  /\bwhat (do|can) you (do|offer|sell)\b/i,
  /\byour services\b/i,
  /\bprice list\b/i,
  /\bhow much\b/i,
];

const PAYMENT_PATTERNS = [
  /\b(sending|sent|transferred|paying|paid)\b[^.]{0,40}\bcredits?\b/i,
  /\bcredits?\b[^.]{0,30}\b(sent|transferred|on the way)\b/i,
];

/**
 * Extracts a fenced or inline JSON object, if present. An agent that speaks
 * JSON gets exact control of the payload; one that speaks prose still works.
 */
export function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates: string[] = [];
  if (fenced?.[1]) candidates.push(fenced[1]);

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(text.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate.trim());
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Not JSON — fall through to the next candidate.
    }
  }
  return null;
}

function serviceFromJson(json: Record<string, unknown>): ServiceName | null {
  const raw = json.service ?? json.tool ?? json.action;
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().replace(/^thesisbreaker[._]/i, "").replace(/-/g, "_");
  return SERVICE_NAMES.includes(normalized as ServiceName) ? (normalized as ServiceName) : null;
}

function payloadFromJson(json: Record<string, unknown>): Record<string, unknown> {
  const inner = json.arguments ?? json.payload ?? json.input ?? json.params;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    return inner as Record<string, unknown>;
  }
  // Otherwise treat the object itself as the payload, minus routing keys.
  const { service, tool, action, ...rest } = json;
  void service;
  void tool;
  void action;
  return rest;
}

/** Pulls the statement out of prose when the caller did not send JSON. */
function statementFromProse(text: string): string | null {
  const quoted = text.match(/"([^"]{12,})"/) ?? text.match(/'([^']{12,})'/);
  if (quoted?.[1]) return quoted[1].trim();

  const marker = text.match(
    /(?:thesis|claim|decision|statement|check|verify|break)\s*[:\-—]\s*([^\n]{12,})/i,
  );
  if (marker?.[1]) return marker[1].trim();

  return null;
}

export function interpret(rawText: string): Intent {
  const text = (rawText ?? "").slice(0, MAX_TEXT).trim();
  if (text.length === 0) return { kind: "ignore" };

  // A payment claim is checked first: "I'm sending you 10 credits" is not a
  // request for more work.
  if (PAYMENT_PATTERNS.some((p) => p.test(text))) {
    const amount = text.match(/(\d{1,6})\s*credits?/i);
    const memo = text.match(/\b(req_[A-Za-z0-9_]+)\b/);
    return {
      kind: "payment_claim",
      amount: amount ? Number.parseInt(amount[1], 10) : null,
      memo: memo ? memo[1] : null,
    };
  }

  const json = extractJson(text);
  if (json) {
    const service = serviceFromJson(json);
    if (service) {
      return { kind: "service_request", service, payload: payloadFromJson(json) };
    }
  }

  for (const [pattern, service] of SERVICE_PATTERNS) {
    if (!pattern.test(text)) continue;

    const payload = json ? payloadFromJson(json) : {};
    if (Object.keys(payload).length === 0) {
      const statement = statementFromProse(text);
      if (!statement) break;
      payload[service === "verify_claim" ? "claim" : "thesis"] = statement;
    }
    return { kind: "service_request", service, payload };
  }

  if (CATALOG_PATTERNS.some((p) => p.test(text))) {
    return { kind: "catalog_request" };
  }

  return { kind: "ignore" };
}

/** The one-screen pitch posted when another agent asks what we sell. */
export function catalogPitch(): string {
  return [
    "ThesisBreaker — break a decision before you act on it.",
    "",
    "Before you commit to a plan, I try to break it: assumptions, evidence,",
    "contradictions, risks, and the conditions that would invalidate it.",
    "",
    `  free_preview   ${PRICES.free_preview} credits  — verdict + score + up to 2 weaknesses`,
    `  verify_claim   ${PRICES.verify_claim} credits  — is this one claim supported by your evidence?`,
    `  break_thesis   ${PRICES.break_thesis} credits — full stress-test with an actionable recommendation`,
    "",
    "Call me with JSON, e.g.:",
    '  {"service":"break_thesis","thesis":"We should migrate billing to event sourcing"}',
    "",
    "Typical response: under a second. Settle after delivery — quote the",
    "request_id in your payment memo so I can reconcile it.",
  ].join("\n");
}
