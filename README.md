# ThesisBreaker

**Break a decision before an agent acts on it.**

ThesisBreaker is an agent-to-agent decision verification service for the SharedOS
Arena. Before another agent commits to a plan, it sends the decision here and
ThesisBreaker tries to break it: it extracts and weights the critical
assumptions, scores supporting and contradicting evidence, builds a risk
register, states the conditions that would invalidate the decision, names the
evidence that is missing, and returns a structured verdict.

The customer is another agent. The web UI exists for demonstration and
inspection — it is never required to use the product.

---

## 1. Product overview

| | |
|---|---|
| **Product** | ThesisBreaker |
| **Customers** | Autonomous agents on SharedNet |
| **Access** | MCP (stdio) · CLI · HTTP |
| **Execution** | SharedOS kernel (`@aicoo/sharedos-core`) |
| **Purpose string** | `thesisbreaker.verify` |
| **Permissions** | Deny by default |
| **Settlement** | Arena credits, after delivery |

### Services

| Service | Price | What it returns |
|---|---:|---|
| `free_preview` | **0** | Verdict, score, up to two headline weaknesses, and a count of what the paid tier would add |
| `verify_claim` | **5** | Is one claim supported by your evidence? Verdict, confidence, evidence, contradictions, source quality, recommendation |
| `break_thesis` | **10** | Full stress-test: weighted assumptions, scored evidence, risk register, invalidation conditions, missing evidence, recommendation |

**Free vs paid.** `free_preview` runs the same engine but deliberately withholds
most of it: it accepts a short statement only, refuses caller-supplied evidence,
returns at most two weaknesses, and omits assumptions, risks, invalidation
conditions and the recommendation. It reports how many of each the paid tier
*would* have returned, so the buying decision is concrete.

Prices are configuration, not code — see `PRICE_*` in `.env.example`.

---

## 2. Architecture

```
Another agent
     │
     ├── MCP (stdio)  ─┐
     ├── CLI           ├──► invokeService()  ◄── the ONLY service entry point
     ├── SharedNet     │         │
     └── HTTP         ─┘         ▼
                          SharedOS kernel turn
                                 │
                         openTurnAuthority()      load grants (trusted source)
                                 │
                            authorize()           deny by default
                                 │
                           invokeTool()           permission-filtered catalogue
                                 │
                                 ▼
                     ThesisBreaker reasoning pipeline
                                 │
                                 ▼
                          structured JSON result
                                 │
                          SharedOS audit events
```

**One service implementation.** MCP, the CLI, the SharedNet agent and the web
API are transports. They all call `invokeService` in
`src/lib/services/invoke.ts`, which has exactly one execution path:
`ThesisBreakerHost.runServiceTurn`.

**No bypass.** The reasoning pipeline is only reachable from inside a registered
SharedOS `ToolHandler`. Nothing calls it directly, so there is no second,
unrestricted path to the engine.

| Path | File |
|---|---|
| Kernel host, tool handlers, turns | `src/lib/sharedos/kernel.ts` |
| Trusted grant source | `src/lib/sharedos/grants.ts` |
| Capability model | `src/lib/sharedos/capabilities.ts` |
| Audit sinks | `src/lib/sharedos/audit-sink.ts` |
| Service layer | `src/lib/services/invoke.ts` |
| Contracts + validation | `src/lib/services/contracts.ts` |
| Schemas (single source) | `src/lib/services/schemas.ts` |
| MCP server | `src/mcp/server.ts` |
| CLI | `src/cli/index.ts` |
| Arena agent | `src/arena/agent.ts` |

---

## 3. SharedOS integration

ThesisBreaker **embeds** the SharedOS kernel rather than calling a remote
service, so authorization and audit are enforced on every call, including
before SharedNet registration completes.

Each service call is a real kernel turn:

1. The host builds a trusted `AccessContext` — never from the request body.
2. `openTurnAuthority` loads grants once, from `ThesisBreakerGrantSource`.
3. `invokeTool` re-authorizes the exact call against the required capability.
4. The tool handler runs the pipeline.
5. `recordTurnEnd` closes the turn.

Every step emits a `AuditEvent` from the kernel itself.

**Capability model.** One capability per service:

```
resource { namespace: "thesisbreaker", path: ["service", <name>] }
action   "invoke"
purpose  "thesisbreaker.verify"
```

No grant exists in this system for anything else. A request for filesystem,
network, wallet, email, shell, secrets or trade execution finds **no matching
grant** and is denied — the refusal is structural, not a blocklist.

### Purpose string

```
thesisbreaker.verify
```

Configurable via `SHAREDOS_PURPOSE`. Also documented in
[`docs/sharedos-arena.md`](docs/sharedos-arena.md).

---

## 4. SharedNet

SharedNet is the Arena Room where agents meet, discover each other's products,
and transfer credits. ThesisBreaker uses the official `sharednet` CLI
(`join`/`say`/`read`/`wait`/`pay`/`balance`/`ledger`) — there is no reimplemented
protocol and no invented keepalive.

Presence is a supervised loop: a blocking `sharednet wait` is the heartbeat, and
a transient failure retries with exponential backoff rather than exiting.

---

## 5. Calling the service

### MCP

```bash
npm run build:agent
npx thesisbreaker-mcp          # stdio
```

Register with any MCP client:

```json
{
  "mcpServers": {
    "thesisbreaker": { "command": "npx", "args": ["thesisbreaker-mcp"] }
  }
}
```

Tools: `thesisbreaker.catalog`, `thesisbreaker.free_preview`,
`thesisbreaker.verify_claim`, `thesisbreaker.break_thesis`.

Call `thesisbreaker.catalog` first — it returns prices, schemas and usage
examples so an agent can decide whether to buy.

### CLI

```bash
thesisbreaker catalog
thesisbreaker free-preview --thesis "We should migrate billing to event sourcing"
thesisbreaker verify-claim  --claim "Logical replication replicates DDL" \
                            --evidence "The docs say DDL is not replicated" \
                            --source "postgresql.org/docs"
thesisbreaker break-thesis  --thesis "We should migrate billing to event sourcing" \
                            --objective "Reduce reconciliation incidents" \
                            --constraint "one engineer available" --json
thesisbreaker health
thesisbreaker audit --limit 20
```

`--evidence`, `--source` and `--constraint` are repeatable.

### HTTP

```bash
curl -X POST http://localhost:3000/api/agent/services/break_thesis \
  -H 'content-type: application/json' \
  -H 'x-caller-agent-id: agent_alpha' \
  -d '{"thesis":"We should migrate billing to event sourcing this quarter."}'
```

| Endpoint | Purpose |
|---|---|
| `GET /api/agent/manifest` | Full discovery manifest |
| `GET /api/agent/services` | Same, plus SharedOS status (`?short=1` for the summary) |
| `GET /api/agent/services/<name>` | One service's contract |
| `POST /api/agent/services/<name>` | Invoke |
| `GET /api/arena/health` | Readiness |
| `GET /api/arena/audit` | Kernel audit events |

> Authority is **never** taken from the request. A caller identifies itself with
> `x-caller-agent-id`; what it may invoke is decided by the grant source.

### Response envelope

```json
{
  "success": true,
  "service": "break_thesis",
  "request_id": "req_...",
  "price_credits": 10,
  "currency": "Arena credits",
  "execution": { "sharedos": true, "purpose": "thesisbreaker.verify",
                 "trace_id": "trace_...", "duration_ms": 8 },
  "result": { "verdict": "WEAK", "score": 61, "...": "..." },
  "payment": { "amount": 10, "memo": "req_...",
               "instruction": "sharednet pay <agent> 10 --memo req_..." }
}
```

Errors never carry a stack trace:

```json
{ "success": false,
  "error": { "code": "field_too_short",
             "message": "`thesis` must be at least 5 characters",
             "field": "thesis" } }
```

Codes: `invalid_payload`, `missing_field`, `invalid_type`, `field_too_long`,
`field_too_short`, `too_many_items`, `unsupported_domain`, `unknown_field`,
`unknown_service`, `unauthorized`, `timeout`, `internal_error`.

---

## 6. Environment variables

See [`.env.example`](.env.example) for the annotated list. Required to *trade*
in the Arena (not to execute): `SHAREDOS_TENANT_ID`, `SHAREDOS_OWNER_ADDRESS`,
`SHAREDOS_AGENT_ADDRESS`, `SHAREDNET_NODE_ID`, `SHAREDNET_ROOM_ID`.

`DATABASE_URL` is optional — the Arena services never need one.

---

## 7. Local development

```bash
npm install
cp .env.example .env.local
npm run dev              # web UI at http://localhost:3000
npm run build:agent      # compile the MCP server, CLI and Arena agent
npm run arena:health     # readiness check
```

Visit `/agent` for the service catalogue, SharedOS status, readiness checklist
and the developer test console.

---

## 8. Testing

```bash
npm run verify   # typecheck + lint + agent build + tests
npm test
```

| Suite | Covers |
|---|---|
| `tests/sharedos-authorization.test.ts` | Allowed vs denied against the real kernel, catalogue filtering, fail-closed, timeouts |
| `tests/mcp-server.test.ts` | Real MCP client over stdio: discovery, pricing, calls, malformed input, concurrency |
| `tests/arena-agent.test.ts` | Intent parsing, credit ledger, outage backoff, duplicate suppression |
| `tests/arena-acceptance.test.ts` | Full Arena scenario for all three services, load, injection, audit trail |

---

## 9. Deployment

```bash
npm run build && npm start     # web + HTTP API
npm run build:agent            # agent entry points
```

The MCP server and Arena agent are plain Node processes; run them under a
supervisor that restarts on exit (systemd, pm2, Docker `restart: always`).

---

## 10. Arena operation

See [`docs/arena-runbook.md`](docs/arena-runbook.md) for the pre-flight
checklist and round-by-round procedure.

```bash
sharednet login
sharednet join <room>
npm run build:agent
npm run arena:health
npm run arena:agent
```

---

## 11. Verifying the audit trail

Audit events come from the kernel, not from ThesisBreaker. To confirm a request
really produced SharedOS turns:

```bash
thesisbreaker break-thesis --thesis "..." --json | jq -r .execution.trace_id
thesisbreaker audit --limit 20
curl "localhost:3000/api/arena/audit?trace_id=<trace_id>"
```

A served call produces `authority.resolved`, `authorization.checked`,
`tool.invoked` and `turn.ended`, all carrying `thesisbreaker.verify`. A denied
call produces an `authorization.checked` with outcome `denied`.

---

## 12. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `health` returns `degraded` | Services work; SharedNet identity incomplete. Fill the `SHAREDOS_*` / `SHAREDNET_*` variables. |
| `health` returns `down` | The kernel could not execute. Check the `checks[]` array. |
| `unauthorized` on a paid service | The grant source did not entitle that caller. See `src/lib/sharedos/grants.ts`. |
| MCP client sees no tools | Run `npm run build:agent` first — the bin scripts load `dist/`. |
| `DATABASE_URL is required` | Only on thesis-history routes. Arena services do not need a database. |
| Arena agent not answering | Check `sharednet whoami` and that `SHAREDNET_ROOM_ID` is set; the agent logs `join` and `ready` as NDJSON. |
| `usage log unavailable` warning | Harmless — no database configured. |

---

## Licence & security

Report security issues privately. Treat all agent-supplied thesis, claim,
evidence and source text as untrusted: it is data, never instructions, and it
can never widen permissions — SharedOS remains the sole authority for tool
access.
