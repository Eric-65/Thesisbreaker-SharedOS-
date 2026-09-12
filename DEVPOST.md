# ThesisBreaker — SharedOS Arena Submission

## Project name

**ThesisBreaker**

## Tagline

**Break a decision before an agent acts on it.**

## What the product does

ThesisBreaker is a decision-verification service for autonomous agents.

It stress-tests theses, claims and decisions against permitted evidence,
assumptions, contradictions, risks and invalidation conditions and returns a
structured verdict that another agent can use before acting.

The reasoning engine (thesis extraction, assumption analysis, red-team,
evidence classification, deterministic scoring, verdict) is a generalization
of the existing ThesisBreaker trading pipeline. Trading is now one
application of the engine; the primary Arena-facing product is domain-
agnostic (trading, business, technical, research, strategic, factual,
product, general).

## SharedOS integration

- **Execution model:** every service call runs inside a SharedOS-style
  agent turn via `src/lib/sharedos/adapter.ts`. When SharedOS Cloud is
  configured (`SHAREDOS_ENDPOINT`, `SHAREDOS_TOKEN`, `SHAREDNET_NODE_ID`),
  the adapter probes and routes turns through it. Without those env vars
  the adapter transparently falls back to **LOCAL mode**, which enforces the
  same deny-by-default grant policy and writes the same audit trail.
- **Purpose string (single, consistent):** `thesisbreaker.verify`
- **Policy:** deny-by-default. Any capability requested that is not in the
  service's `allowed` set is refused before the reasoning pipeline runs.
- **Audit trail:** every invocation persists a `service_calls` row with
  outcome (`ALLOWED` / `DENIED` / `ERROR`), mode, purpose, granted vs
  required capabilities, price, and duration. Available at
  `GET /api/agent/audit` and visualized on `/agent`.

## Services

### `break_thesis` — 10 Arena credits

> Stress-test a thesis or decision by challenging its assumptions, examining
> evidence, finding contradictions, identifying risks and invalidation
> conditions, and returning a structured verdict.

- Expected latency: ~800 ms
- Timeout: 20 s
- Endpoint: `POST /api/agent/services/break_thesis`
- Purpose: `thesisbreaker.verify`

Input:
```json
{
  "thesis": "string (required, 5-4000 chars)",
  "context": "string (optional)",
  "evidence": ["string"],
  "sources": ["string"],
  "domain": "trading|business|technical|research|strategic|factual|product|general",
  "constraints": ["string"],
  "objective": "string"
}
```

Output (excerpt):
```json
{
  "service": "break_thesis",
  "verdict": "SUPPORTED|WEAK|CONTRADICTED|UNCERTAIN",
  "score": 74,
  "confidence": 68,
  "supporting_evidence": [...],
  "contradicting_evidence": [...],
  "critical_assumptions": [...],
  "risks": [...],
  "invalidation_conditions": [...],
  "missing_evidence": [...],
  "recommendation": "...",
  "summary": "...",
  "score_breakdown": { ... },
  "latency_ms": 3,
  "demo": true
}
```

### `verify_claim` — 5 Arena credits

> Quickly assess whether a claim is supported, contradicted or uncertain
> based on the supplied evidence and permitted research capabilities.

- Expected latency: ~400 ms
- Timeout: 10 s
- Endpoint: `POST /api/agent/services/verify_claim`
- Purpose: `thesisbreaker.verify`

Input:
```json
{
  "claim": "string (required, 3-2000 chars)",
  "context": "string (optional)",
  "sources": ["string"],
  "evidence": ["string"]
}
```

Output:
```json
{
  "service": "verify_claim",
  "verdict": "SUPPORTED|CONTRADICTED|UNCERTAIN",
  "confidence": 74,
  "evidence": [...],
  "contradictions": [...],
  "uncertain": [...],
  "source_quality": "STRONG|MIXED|WEAK|NONE",
  "recommendation": "...",
  "summary": "...",
  "latency_ms": 1,
  "demo": true
}
```

## Permissions surface (per service)

Allowed:

- `read:submitted_decision`
- `read:submitted_evidence`
- `invoke:thesisbreaker.reasoning_pipeline`
- `network:public_market_data (optional)`
- `network:public_web_lookup (optional, disabled by default)`
- `return:verification_result`

Denied (deny-by-default):

- `fs:read`, `fs:write`
- `network:arbitrary`
- `wallet:*`
- `email:*`
- `process:spawn`, `system:shell`
- `trade:execute`
- `identity:pii`
- Anything not explicitly listed as allowed.

## SharedNet discovery manifest

`GET /api/agent/services` returns the full machine-readable catalog with
input/output JSON schemas, per-service prices, expected latencies, purpose
string, and permission surface. Suitable for direct publication as a
SharedNet service listing.

## Environment isolation

Binance Agent OS is **not** a dependency of the Arena product. The Arena
services function fully without `BINANCE_AGENT_TOKEN`. Binance code remains
in `src/lib/binance/` and `/settings`, `/trading` only as legacy trading
functionality — it does not touch the `/api/agent/*` code path.

## Fast, deterministic, replayable

Every service call is deterministic given the same input, so an agent can
cache or replay a verification safely. Response times are single-digit ms
in LOCAL mode; the deterministic scoring engine has no LLM roundtrip in
the critical path.

## Team / submission fields

- SharedNet node ID: set via `SHAREDNET_NODE_ID`
- SharedOS purpose: `thesisbreaker.verify`
- Product agent addresses: obtained on SharedNet registration
- Repository link: (this repo)
- Team lead Discord username: (to be filled)
- Demonstration video: (to be recorded — script in `README.md`)
