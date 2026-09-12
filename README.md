# ThesisBreaker

> **Break a decision before an agent acts on it.**

A **decision-verification service for autonomous agents** running on
**SharedOS**. Any agent on SharedNet can submit a thesis, claim or decision
and receive a structured verdict — assumptions, contradictions, risks and
invalidation conditions — usable as the middle step of any autonomous
workflow. See [`DEVPOST.md`](./DEVPOST.md) for the Arena submission summary.

Trading (via Binance Agent OS) remains one legacy application of the same
reasoning engine but is no longer required for the Arena services.

- **Landing**: `/`
- **Agent Services (Arena)**: `/agent`
- **Break a thesis (human UI)**: `/new`
- **Markets** (live Binance public data): `/market`
- **Positions**: `/trading` — legacy trading UI
- **Activity**: `/alerts`
- **Settings**: `/settings`

## Arena services

| Service | Price | Endpoint | Purpose |
|---|---|---|---|
| `break_thesis` | 10 credits | `POST /api/agent/services/break_thesis` | `thesisbreaker.verify` |
| `verify_claim` | 5 credits | `POST /api/agent/services/verify_claim` | `thesisbreaker.verify` |

Full machine-readable manifest: `GET /api/agent/services`
Audit trail: `GET /api/agent/audit`
SharedOS status: `GET /api/agent/sharedos`

## The loop

```
Idea
 → Thesis extraction
 → Red-team challenge
 → Live Binance market context
 → Evidence (FACT vs Model Interpretation vs Demo)
 → Risk check
 → THESIS SCORE
 → TRADE READINESS
 → Verdict (TRADE / WAIT / NO_TRADE / INVALIDATED)
 → Execution proposal
 → USER REVIEW
 → Binance Agent OS action  (or clearly labeled Demo Agent)
 → Monitoring
 → “What changed?”
```

Two independent statuses are always shown:

- **AGENT**: `DEMO AGENT` or `BINANCE AGENT` (authenticated MCP session)
- **DATA**: `LIVE PUBLIC DATA` or `DEMO DATA` (Binance public spot data)

You can be `DEMO AGENT + LIVE PUBLIC DATA` at the same time — the app never
conflates the two.

## Stack

- Next.js 16 (App Router, Turbopack) + React 19 + TypeScript
- Tailwind CSS v4 (single-file design tokens in `globals.css`)
- Framer Motion + Recharts + Lucide
- PostgreSQL via Drizzle ORM (`theses`, `orders`, `monitoring_events`,
  `watchlist`)
- Server-only market/agent adapters in `src/lib/market/*` and
  `src/lib/binance/*`

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── agent/status/           # /api/agent/status
│   │   ├── market/{quote,bars,search,nft,clock}/
│   │   ├── theses/                 # POST create, GET list
│   │   ├── theses/[id]/            # GET one, POST /monitor
│   │   ├── theses/[id]/proposal/   # POST — builds an execution proposal
│   │   ├── theses/[id]/approve/    # POST — user-approved action
│   │   ├── theses/demo/            # POST — one-click flagship demo
│   │   ├── theses/extract/         # POST — extraction only
│   │   ├── watchlist/              # GET/POST/DELETE
│   │   └── health/
│   ├── (landing)/page.tsx
│   ├── dashboard, market, new, trading, alerts, history, settings/
│   └── thesis/[id]/
├── components/
│   ├── AppShell.tsx                # sidebar + top bar + mobile bottom nav
│   ├── SystemStatus.tsx            # honest AGENT + DATA badges
│   ├── MobileBottomNav.tsx
│   ├── landing/                    # Hero, MiniDemo, HowItWorks, ...
│   ├── thesis/                     # NewThesisWorkflow, ThesisWorkspace, ...
│   ├── trading/                    # AgentActionReview, PositionsClient
│   ├── market/                     # LivePrice, LiveChart, NftPanel, badges
│   ├── dashboard/, history/, alerts/, settings/
│   └── HeroVisual.tsx              # SVG bull/bear + yellow agent line
└── lib/
    ├── agents/                     # extractor, evidence, redTeam, score, pipeline
    ├── market/
    │   ├── router.ts, registry.ts, cache.ts, http.ts, types.ts, featured.ts
    │   └── providers/{binance,coingecko,opensea}.ts
    ├── binance/agent.ts            # Binance Agent OS MCP adapter (server-only)
    ├── risk.ts                     # deterministic risk gate + Trade Readiness
    └── monitor.ts                  # thesis monitoring + “what changed” diffs
```

## Binance Agent OS integration

Per the official Binance announcement, the Agent OS MCP endpoint is:

```
https://agent.binance.com/mcp/agentic     (Streamable HTTP)
```

**We never invent endpoints.** `src/lib/binance/agent.ts` is a small, honest
adapter with two responsibilities:

1. Report the connection state (`NOT_CONNECTED | CONNECTED | ERROR`) based on
   whether `BINANCE_AGENT_TOKEN` is present server-side.
2. Provide a single `callAgentTool(tool, args)` entry point that proxies to
   the MCP endpoint via Streamable HTTP when a bearer token is present.

If the token is absent, the app runs in **DEMO AGENT** mode. Every simulated
action is clearly labelled as `Demo Agent`, and the app will **never** silently
substitute a demo action for a real one.

## Environment variables

Set these server-side only:

```bash
# Required
DATABASE_URL=postgres://...

# Optional — route Arena services through SharedOS Cloud
SHAREDOS_ENDPOINT=https://...
SHAREDOS_TOKEN=...
SHAREDNET_NODE_ID=...

# Optional — enables live Binance Agent OS actions on the legacy trading UI
BINANCE_AGENT_TOKEN=...

# Optional — improves rate limits
COINGECKO_API_KEY=...
OPENSEA_API_KEY=...
```

Every Arena service functions fully **without any credentials**. When
SharedOS Cloud env vars are missing, the adapter runs in **LOCAL mode**,
enforces the same deny-by-default grants, and writes the same audit trail.

**Never** put these in `NEXT_PUBLIC_*` variables or client-side code. Public
Binance market data (`data-api.binance.vision`) requires no credentials.

## Local development

```bash
npm install
npx drizzle-kit push       # bootstrap Postgres schema
npm run dev
```

## Production

```bash
npm run build
npm start
```

Preferred platform: **Vercel** for the Next.js app + **Neon** or **Supabase**
for Postgres. Set the env vars above in your project settings.

## Safety posture

- ThesisBreaker never silently substitutes Demo Agent for the Binance Agent
  OS. If Agent OS is intended and unavailable, the app displays
  `BINANCE AGENT OS UNAVAILABLE` and refuses the action.
- Every action uses a UUID `client_order_id` for idempotency.
- ThesisBreaker never executes an action without an explicit user approval
  step and a passing deterministic risk gate.
- The AI agent runs the reasoning; the deterministic risk gate is the sole
  execution authority.
- AI analysis is decision support only. **Not financial advice.**
- ThesisBreaker is an independent product. **Not affiliated with, endorsed by,
  or sponsored by Binance.**
