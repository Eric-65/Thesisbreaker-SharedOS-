# Devpost submission — ThesisBreaker

Draft copy for the submission form. Placeholders marked **`<<FILL>>`** must be
replaced with real values before submitting.

---

## Project name

**ThesisBreaker**

## Tagline

**Break a decision before an agent acts on it.**

---

## Product description

ThesisBreaker is an autonomous-agent decision verification service.

Agents are increasingly trusted to act — to commit to a migration, a trade, a
vendor, a plan. The expensive failure is not a wrong answer, it is a confident
one. ThesisBreaker exists to be the step before the commitment.

Send a decision and ThesisBreaker tries to break it:

- **Assumptions** — extracted, weighted, and challenged individually
- **Evidence** — supporting and contradicting, scored for relevance and confidence
- **Contradictions** — the strongest case against the decision
- **Risks** — a register with severities
- **Invalidation conditions** — the explicit things that would prove it wrong
- **Missing evidence** — what you would need to be sure

It returns a structured verdict — `SUPPORTED` / `WEAK` / `CONTRADICTED` /
`UNCERTAIN` — with a 0–100 score, a confidence figure, and a recommendation an
agent can act on directly. Conclusions and evidence summaries only; never
private reasoning traces.

The customer is another agent. ThesisBreaker is reachable over MCP and a CLI
with no human in the loop and no web page in the path. Every paid call executes
inside the SharedOS kernel, under one purpose string, with deny-by-default
permissions and a real audit trail.

---

## Service listing

### `break_thesis` — 10 Arena credits

**What it does.** The full stress-test. Before you act on a decision,
ThesisBreaker tries to break it, then tells you how it fails and what would
change its mind.

**Input**

```json
{
  "thesis": "We should migrate the billing service to event sourcing this quarter.",
  "objective": "Reduce billing reconciliation incidents",
  "constraints": ["one engineer available", "must not pause billing"],
  "evidence": ["Reconciliation incidents rose 40% last quarter."],
  "sources": ["internal incident review Q3"],
  "domain": "technical"
}
```

**Output**

```json
{
  "verdict": "WEAK",
  "score": 61,
  "confidence": 74,
  "supporting_evidence": [],
  "contradicting_evidence": [],
  "critical_assumptions": [],
  "risks": [],
  "invalidation_conditions": [],
  "missing_evidence": [],
  "recommendation": "...",
  "summary": "..."
}
```

**How an agent calls it**

```
MCP   thesisbreaker.break_thesis
CLI   thesisbreaker break-thesis --thesis "..." --objective "..." --json
HTTP  POST /api/agent/services/break_thesis
```

---

### `verify_claim` — 5 Arena credits

**What it does.** Checks one factual or technical claim against the evidence you
supply. Narrower and cheaper than `break_thesis`: one claim, not a whole
decision.

**Input**

```json
{
  "claim": "Postgres logical replication replicates DDL changes automatically.",
  "evidence": ["The Postgres docs state DDL is not replicated."],
  "sources": ["postgresql.org/docs/current/logical-replication-restrictions.html"]
}
```

**Output**

```json
{
  "verdict": "CONTRADICTED",
  "confidence": 94,
  "evidence": [],
  "contradictions": [],
  "source_quality": "STRONG",
  "recommendation": "...",
  "summary": "..."
}
```

**How an agent calls it**

```
MCP   thesisbreaker.verify_claim
CLI   thesisbreaker verify-claim --claim "..." --evidence "..."
HTTP  POST /api/agent/services/verify_claim
```

---

### `free_preview` — 0 credits

**What it does.** A limited, genuinely useful demonstration so an agent can
evaluate ThesisBreaker before spending anything.

**Limits (enforced, not advisory)**

- short statement only (600 characters)
- **does not accept** your evidence or sources — that is a paid capability
- returns at most two headline weaknesses
- no assumptions, risks, invalidation conditions or recommendation

It also returns a count of exactly how many assumptions, contradictions, risks
and invalidation conditions the paid tier *would* have returned for that same
input — so the upgrade decision is concrete rather than a sales pitch.

```
MCP   thesisbreaker.free_preview
CLI   thesisbreaker free-preview --thesis "..."
HTTP  POST /api/agent/services/free_preview
```

---

## Why an agent should spend 10 credits

> Before you act on a decision, ThesisBreaker tries to break it. It checks
> supporting evidence, contradictions, assumptions, risks and invalidation
> conditions, then returns a structured verdict.

Ten credits is cheap enough to check something you were going to do anyway.
Typical response time is milliseconds, the output is machine-readable, and the
recommendation is directly actionable — it is designed for repeat transactions,
not for one expensive purchase.

---

## SharedOS integration

**Purpose string**

```
thesisbreaker.verify
```

Applied to every access context, every capability grant constraint, and every
kernel audit event.

**Execution.** ThesisBreaker embeds the SharedOS kernel
(`@aicoo/sharedos-core`). Each call is a real kernel turn: authority is resolved
once from a trusted grant source, the exact call is re-authorized against the
tool's required capability, the handler runs, and the turn is recorded. The
reasoning pipeline is only reachable from inside a registered SharedOS tool
handler, so no entry point can bypass authorization.

**Permissions.** Deny by default. One capability per service
(`thesisbreaker:/service/<name>`, action `invoke`). No grant exists in the
system for filesystem, network, wallet, email, shell, secrets or trade
execution — a request for one finds no matching grant and is refused. The
refusal is structural, not a blocklist lookup.

**Audit.** Every turn emits kernel-generated events — `authority.resolved`,
`authorization.checked`, `tool.invoked`, `turn.ended` — viewable at
`/api/arena/audit` and via `thesisbreaker audit`. Denied calls appear too.

---

## Submission details

| Field | Value |
|---|---|
| **Repository** | https://github.com/Eric-65/Thesisbreaker-SharedOS- |
| **SharedOS purpose** | `thesisbreaker.verify` |
| **Agent node ID** | **`<<FILL: from `sharednet whoami` after registration>>`** |
| **Product agent address** | **`<<FILL: from SharedNet registration>>`** |
| **Owner address** | **`<<FILL: your SharedOS owner address>>`** |
| **Tenant ID** | **`<<FILL: supplied by the organizers>>`** |
| **Discord username** | **`<<FILL>>`** |
| **Demo video** | **`<<FILL: optional — script below, not yet recorded>>`** |

---

## Two-minute demo script (not yet recorded)

**0:00 — The problem.** "Agents are trusted to act. The expensive failure is a
confident wrong decision. ThesisBreaker is the step before the commitment."

**0:15 — Discovery.** Another agent lists ThesisBreaker's tools over MCP. Show
the catalogue: three services, prices visible — `free_preview` 0,
`verify_claim` 5, `break_thesis` 10.

**0:35 — The free tier.** Agent calls `free_preview`. A verdict, a score, two
weaknesses — and a count of what the paid tier would add. "It is useful, and it
is obviously limited."

**0:55 — The paid call.** Agent calls `break_thesis` with a real decision. Show
the response: assumptions, contradictions, risks, invalidation conditions,
recommendation. Point at `duration_ms` — milliseconds, against a five-minute
Arena ceiling.

**1:20 — SharedOS.** Show `execution.sharedos: true` and the purpose string.
Open the audit trail filtered by `trace_id`: `authority.resolved`,
`authorization.checked`, `tool.invoked`, `turn.ended`.

**1:40 — The permission boundary.** Run the authorization test: a caller with
only the free tier is denied `break_thesis` — a clean structured refusal, and
the same caller is still served `free_preview`. The service does not crash.

**1:50 — Settlement and presence.** The response quotes its price and a memo.
The other agent sends credits; ThesisBreaker acknowledges and links the payment
to the request. The agent is still online, still answering.

**2:00 — Close.** "Break a decision before an agent acts on it."
