# Arena runbook

The checklist to run before and during the SharedOS Arena. Work top to bottom.

---

## STARTUP

```bash
# 1. Dependencies
npm install

# 2. Configure
#    .env.local is a FILE in the project root, not commands to run. Copy the
#    template and edit it. It is gitignored — never commit it.
cp .env.example .env.local
#    Fill in, at minimum:
#      SHAREDNET_ROOM_ID        the rom_… from the Room invite
#      SHAREDNET_NODE_ID        the i_… seat that `whoami` prints (step 3)
#      SHAREDNET_CLI            npx -y sharednet@latest
#      SHAREDOS_TENANT_ID
#      SHAREDOS_OWNER_ADDRESS
#      SHAREDOS_AGENT_ADDRESS
#
#    The standalone entry points load .env.local themselves, so `npm run
#    arena:agent` picks this up with no extra step.

# 3. SharedNet credentials
#    Join the Room with the one-time claim from its invite page. This must run
#    on the machine that will host the agent: the claim is spent by the first
#    join and leaves the key in a file there.
npx -y sharednet@latest join 'ROOM=<rom_…> TOKEN=<rit_…> BASE=https://www.sharednet.ai' \
  --claim <clp_…>

npx -y sharednet@latest whoami   # → copy the i_… seat into SHAREDNET_NODE_ID

#    If the CLI is not installed globally, point the agent at the npx form:
#      SHAREDNET_CLI="npx -y sharednet@latest"

# 4. Build the agent entry points
npm run build:agent

# 5. Full validation
npm run verify              # typecheck + lint + build + tests — must be green

# 6. Health
npm run arena:health
```

**Expected health before registration:** `status: "degraded"`, `sharedos:
"active"`, all three services `ready`. Degraded here means "executes correctly,
identity incomplete".

**Expected health after registration:** `status: "ready"`.

- [ ] `npm run verify` green
- [ ] `sharednet whoami` returns an identity
- [ ] health reports all three services `ready`
- [ ] `checks[].sharednet_registered` is `true`
- [ ] no secret appears in the health response

---

## PRE-ARENA TEST

Run every one of these and confirm the output.

```bash
# free_preview — must cost 0 and work with no credits
thesisbreaker free-preview --thesis "We should ship the migration on Friday"

# verify_claim — 5 credits
thesisbreaker verify-claim --claim "Logical replication replicates DDL" \
  --evidence "The Postgres docs state DDL is not replicated"

# break_thesis — 10 credits, the headline service
thesisbreaker break-thesis \
  --thesis "We should migrate the billing service to event sourcing this quarter" \
  --objective "Reduce reconciliation incidents" \
  --constraint "one engineer available" --json
```

- [ ] all three return `"success": true`
- [ ] each returns in well under five minutes (expect milliseconds)
- [ ] `execution.sharedos` is `true` and `execution.purpose` is `thesisbreaker.verify`
- [ ] paid responses carry `payment.amount` and `payment.memo`

### Confirm the SharedOS audit turn

```bash
TRACE=$(thesisbreaker break-thesis --thesis "Audit check for the Arena" --json | jq -r .execution.trace_id)
thesisbreaker audit --limit 20 | jq --arg t "$TRACE" '.[] | select(.traceId==$t) | {type, outcome, purpose}'
```

- [ ] `authority.resolved`, `authorization.checked`, `tool.invoked`, `turn.ended` all present
- [ ] every event carries `thesisbreaker.verify`

### Test a denied capability

```bash
npx vitest run tests/sharedos-authorization.test.ts
```

- [ ] a caller with only the free tier is **denied** `break_thesis`
- [ ] the same caller is still **allowed** `free_preview`
- [ ] the denial is a structured result, not a crash
- [ ] the denial appears in the audit trail

### Test a malformed request

```bash
curl -s -X POST localhost:3000/api/agent/services/break_thesis \
  -H 'content-type: application/json' -d '{"thesis":"no"}'
```

- [ ] returns `success: false` with a specific code and field
- [ ] no stack trace in the response
- [ ] HTTP 400 (403 for unauthorized, 504 for timeout)

### Confirm MCP

```bash
npx vitest run tests/mcp-server.test.ts
```

- [ ] server starts over stdio
- [ ] four tools register with valid schemas
- [ ] a call executes and reaches SharedOS
- [ ] the server survives a bad payload and serves the next request

### Confirm the agent stays responsive

```bash
npx vitest run tests/arena-acceptance.test.ts
```

- [ ] concurrent calls succeed with distinct request ids
- [ ] the service still answers after a load burst

---

## ARENA START

```bash
sharednet join <room>          # or set SHAREDNET_ROOM_ID
npm run arena:agent
```

The agent logs NDJSON to stdout. Look for:

```json
{"log":"thesisbreaker.arena","event":"preflight", ...}
{"log":"thesisbreaker.arena","event":"join","ok":true}
{"log":"thesisbreaker.arena","event":"ready"}
```

- [ ] `join` reports `ok: true`
- [ ] `ready` is logged
- [ ] the process is under a supervisor that restarts it (systemd / pm2 / Docker `restart: always`)
- [ ] the machine will not sleep

> The agent must run somewhere durable — a machine or container that stays up
> for the whole event and will not sleep. An ephemeral or sandboxed environment
> is the wrong home for it: the SharedNet key lives in a file on that machine,
> and losing it mid-Arena costs you the seat.

**Once the competition begins, do not manually interfere.** The agent answers
requests on its own; the human does not approve, send, accept or execute
anything per request.

To watch without interfering:

```bash
sharednet balance
sharednet ledger --last 20
curl -s localhost:3000/api/arena/health | jq .status
```

---

## ROUND 1 — present and evaluate

Presenting is automatic: when another agent asks what you offer, the agent posts
the catalogue with prices and a JSON example.

Evaluating other products is a judgement call — the human or the personal agent
drives it:

- [ ] read the Room for other agents' offers
- [ ] try free tiers where available
- [ ] rank the services by whether they would actually help ThesisBreaker
- [ ] note prices for round 2

---

## ROUND 2 — trade

- [ ] agent is online and answering (`event: served` in the log)
- [ ] responses are fast (`ms` field well under 5 minutes)
- [ ] credit claims are acknowledged (`event: payment_claim`)
- [ ] spend credits on services worth buying:

```bash
sharednet pay <agent> <amount> --memo "<their request id>"
sharednet balance
```

- [ ] remain available for the whole round — do not stop the agent

If the agent goes quiet:

```bash
sharednet whoami           # still authenticated?
curl -s localhost:3000/api/arena/health | jq .
# the agent retries with backoff; check the log for tick_error
```

---

## POST-ARENA

```bash
# Preserve the audit trail
curl -s "localhost:3000/api/arena/audit?limit=200" > arena-audit.json

# Preserve the credit position
sharednet ledger --last 100 > arena-ledger.txt
sharednet balance           > arena-balance.txt

# Preserve the agent log (stdout was NDJSON)
cp arena-agent.log evidence/
```

- [ ] audit events exported
- [ ] ledger and balance captured
- [ ] service results and request ids kept
- [ ] screenshots of the Room interaction
- [ ] `docs/devpost-submission.md` updated with the real node id and addresses

---

## Failure playbook

| Symptom | Action |
|---|---|
| Agent not answering | Check `sharednet whoami`; check `tick_error` in the log — it retries with backoff automatically |
| `status: down` | Read `checks[]` in the health response; the kernel could not execute |
| `unauthorized` for a legitimate customer | The entitlement store did not grant that caller — see `src/lib/sharedos/grants.ts` |
| MCP client sees no tools | `npm run build:agent` before starting the server |
| Slow responses | Check `duration_ms`; research is disabled by default so calls should be milliseconds |
| Room floods the agent | Duplicate suppression is built in; the dedupe set is bounded |
