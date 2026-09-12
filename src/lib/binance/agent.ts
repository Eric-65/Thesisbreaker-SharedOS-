/**
 * Binance Agent OS adapter.
 *
 * THESIS ENGINE          <—— pure reasoning
 *    ↓
 * BINANCE AGENT ADAPTER  <—— this module
 *    ↓
 * BINANCE AGENT OS       <—— agent.binance.com/mcp/agentic  (Streamable HTTP)
 *
 * Honest connection model. We report three independent axes so the UI can
 * never conflate them:
 *
 *   1. MARKET_DATA         — public Binance market data reachability
 *                            (does NOT require authentication)
 *   2. AGENT_CONNECTION    — authenticated MCP session established
 *                            (requires bearer token AND a positive probe)
 *   3. TRADING_PERMISSION  — whether that authenticated session actually
 *                            reports a trading capability for the agent
 *                            sub-account
 *
 * Rules the whole app depends on:
 *   - Presence of BINANCE_AGENT_TOKEN is a *prerequisite*, not proof of a
 *     working session. We must probe.
 *   - Public market data availability is NEVER promoted to "connected".
 *   - We NEVER invent endpoints. `/mcp/agentic` is Binance's documented
 *     Streamable HTTP endpoint; we do not fabricate other URLs.
 *   - We NEVER surface the bearer token to the client. `hasCredential` is
 *     the only client-visible signal.
 */

const AGENT_OS_MCP_URL = "https://agent.binance.com/mcp/agentic";
const BINANCE_PUBLIC_DATA_URL = "https://data-api.binance.vision/api/v3/ping";

/** Ephemeral in-process cache. Deliberately short so an outage flips the
 * UI to RECONNECT_REQUIRED within one refresh. */
const CACHE_TTL_MS = 20_000;

// ---------- Types ----------

export type AgentConnectionState =
  | "DISCONNECTED"
  | "CONNECTING"
  | "AUTHORIZING"
  | "CONNECTED"
  | "AUTHORIZATION_EXPIRED"
  | "RECONNECT_REQUIRED"
  | "ERROR"
  | "DEMO";

export type MarketDataState =
  | "AVAILABLE" // verified live public Binance data
  | "DEGRADED" // reachable but with issues
  | "UNAVAILABLE"; // provider unreachable

export type TradingPermissionState =
  | "NOT_AUTHORIZED"
  | "AUTHORIZED"
  | "READ_ONLY"
  | "UNKNOWN";

export type AccountState = "NOT_CONNECTED" | "CONNECTED" | "UNKNOWN";

export type Environment = "AGENT_OS" | "DEMO";

export interface AgentConnectionStatus {
  environment: Environment;
  mcpUrl: string;
  hasCredential: boolean;

  agentConnection: AgentConnectionState;
  marketData: MarketDataState;
  account: AccountState;
  trading: TradingPermissionState;

  message: string;
  lastVerified: string; // ISO
  lastError?: string;
}

// ---------- Env ----------

export function getAgentToken(): string | null {
  const tok = process.env.BINANCE_AGENT_TOKEN?.trim();
  return tok && tok.length > 0 ? tok : null;
}

/** True iff a token is configured. Does NOT mean connected. */
export function isAgentTokenConfigured(): boolean {
  return getAgentToken() !== null;
}

// ---------- Cache ----------

const g = globalThis as typeof globalThis & {
  __tbAgentStatus?: { at: number; value: AgentConnectionStatus };
};

function cached(): AgentConnectionStatus | null {
  const c = g.__tbAgentStatus;
  if (!c) return null;
  if (Date.now() - c.at > CACHE_TTL_MS) return null;
  return c.value;
}

function cache(v: AgentConnectionStatus) {
  g.__tbAgentStatus = { at: Date.now(), value: v };
}

// ---------- Probes ----------

/** Public Binance data probe. Never authenticated. */
async function probePublicData(): Promise<MarketDataState> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(BINANCE_PUBLIC_DATA_URL, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(t);
    if (res.ok) return "AVAILABLE";
    return "DEGRADED";
  } catch {
    return "UNAVAILABLE";
  }
}

interface McpProbeResult {
  ok: boolean;
  status: "CONNECTED" | "AUTHORIZATION_EXPIRED" | "ERROR";
  trading: TradingPermissionState;
  detail?: string;
}

/**
 * Authenticated MCP probe. Issues an MCP `initialize` request (the standard
 * Streamable-HTTP handshake used by all MCP clients). A 200-OK response
 * with a matching `result` proves an authorized session; 401/403 indicates
 * an expired or missing authorization; anything else is ERROR.
 *
 * We never invent Binance methods. `initialize` is part of the MCP protocol
 * itself, not a Binance-specific endpoint, so this probe is safe.
 */
async function probeAgentSession(token: string): Promise<McpProbeResult> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(AGENT_OS_MCP_URL, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "tb-probe",
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "ThesisBreaker", version: "1.0.0" },
        },
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(t);

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        status: "AUTHORIZATION_EXPIRED",
        trading: "NOT_AUTHORIZED",
        detail: `Binance Agent OS returned ${res.status}. Reconnect required.`,
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        status: "ERROR",
        trading: "UNKNOWN",
        detail: `Binance Agent OS returned ${res.status}.`,
      };
    }

    // Try to parse either JSON or the first SSE event; we only need to see
    // a valid MCP result payload.
    const contentType = res.headers.get("content-type") ?? "";
    let bodyText = "";
    try {
      bodyText = await res.text();
    } catch {
      /* ignore */
    }
    let looksLikeMcpResult = false;
    if (contentType.includes("application/json")) {
      try {
        const j = JSON.parse(bodyText) as { result?: unknown; error?: { message?: string } };
        if (j && "result" in j) looksLikeMcpResult = true;
        if (j?.error?.message) {
          return {
            ok: false,
            status: "ERROR",
            trading: "UNKNOWN",
            detail: `Agent OS error: ${j.error.message}`,
          };
        }
      } catch {
        /* ignore parse errors — SSE next */
      }
    }
    if (!looksLikeMcpResult && bodyText.includes('"result"')) {
      // Streamable HTTP with an initial SSE event carrying the JSON-RPC result.
      looksLikeMcpResult = true;
    }
    if (!looksLikeMcpResult) {
      return {
        ok: false,
        status: "ERROR",
        trading: "UNKNOWN",
        detail: "Unrecognized MCP response payload.",
      };
    }

    // We deliberately do NOT infer trading permission from `initialize`.
    // Binance's official design ties trading capability to the agent sub-
    // account permissions the user configures. Until we can enumerate that
    // safely from the MCP tool list, we report READ_ONLY as a conservative
    // default. When the calling code proves an order was accepted, it can
    // upgrade this to AUTHORIZED per session.
    return { ok: true, status: "CONNECTED", trading: "READ_ONLY" };
  } catch (err) {
    return {
      ok: false,
      status: "ERROR",
      trading: "UNKNOWN",
      detail: (err as Error).message,
    };
  }
}

// ---------- Public API ----------

/**
 * Determine the honest current status. Runs both probes in parallel.
 * Cached for `CACHE_TTL_MS` to protect providers from being hit on every
 * client refresh.
 */
export async function getAgentConnectionStatus(
  opts: { force?: boolean } = {},
): Promise<AgentConnectionStatus> {
  if (!opts.force) {
    const c = cached();
    if (c) return c;
  }

  const token = getAgentToken();
  const hasCredential = !!token;

  const [marketData, mcp] = await Promise.all([
    probePublicData(),
    token ? probeAgentSession(token) : Promise.resolve<McpProbeResult>({
      ok: false,
      status: "ERROR",
      trading: "NOT_AUTHORIZED",
      detail: "No BINANCE_AGENT_TOKEN configured on the server.",
    }),
  ]);

  let agentConnection: AgentConnectionState;
  let account: AccountState;
  let trading: TradingPermissionState;
  let environment: Environment;
  let message: string;
  let lastError: string | undefined;

  if (!hasCredential) {
    agentConnection = "DEMO";
    account = "NOT_CONNECTED";
    trading = "NOT_AUTHORIZED";
    environment = "DEMO";
    message =
      "Running in DEMO AGENT mode. Public Binance market data is used where reachable, but no authenticated agent session is established. Set BINANCE_AGENT_TOKEN (obtained through the official Binance Agent OS authorization flow) to enable live agent capabilities.";
  } else if (mcp.status === "CONNECTED") {
    agentConnection = "CONNECTED";
    account = "CONNECTED";
    trading = mcp.trading;
    environment = "AGENT_OS";
    message =
      "Binance Agent OS session verified via MCP initialize handshake. Trading permission reflects agent sub-account configuration.";
  } else if (mcp.status === "AUTHORIZATION_EXPIRED") {
    agentConnection = "AUTHORIZATION_EXPIRED";
    account = "NOT_CONNECTED";
    trading = "NOT_AUTHORIZED";
    environment = "DEMO";
    lastError = mcp.detail;
    message =
      "Binance Agent OS authorization has expired or been revoked. Reconnect through the official Agent OS flow to re-enable live agent capabilities.";
  } else {
    agentConnection = "ERROR";
    account = "UNKNOWN";
    trading = "UNKNOWN";
    environment = "DEMO";
    lastError = mcp.detail;
    message =
      "Binance Agent OS MCP endpoint could not be reached with the configured credential. The app remains in DEMO AGENT mode.";
  }

  const status: AgentConnectionStatus = {
    environment,
    mcpUrl: AGENT_OS_MCP_URL,
    hasCredential,
    agentConnection,
    marketData,
    account,
    trading,
    message,
    lastVerified: new Date().toISOString(),
    lastError,
  };
  cache(status);
  return status;
}

/**
 * Synchronous best-effort helper used by server components that don't want
 * to await a probe. Returns the last cached status if fresh, otherwise a
 * conservative "not yet verified" snapshot without ever claiming CONNECTED.
 */
export function getAgentConnectionStatusSync(): AgentConnectionStatus {
  const c = cached();
  if (c) return c;
  const hasCredential = isAgentTokenConfigured();
  return {
    environment: hasCredential ? "DEMO" : "DEMO",
    mcpUrl: AGENT_OS_MCP_URL,
    hasCredential,
    agentConnection: hasCredential ? "CONNECTING" : "DEMO",
    marketData: "AVAILABLE", // optimistic; the async probe corrects this within seconds
    account: "NOT_CONNECTED",
    trading: "NOT_AUTHORIZED",
    message: hasCredential
      ? "Verifying Binance Agent OS session — status will resolve within seconds."
      : "Running in DEMO AGENT mode. Connect Binance Agent OS to enable live capabilities.",
    lastVerified: new Date(0).toISOString(),
  };
}

// ---------- Tool invocation (unchanged surface, but stricter about state) ----------

export async function callAgentTool<T = unknown>(
  tool: string,
  args: Record<string, unknown>,
): Promise<
  | { ok: true; mode: "live"; data: T }
  | { ok: true; mode: "demo"; data: null; reason: string }
  | { ok: false; error: string }
> {
  const token = getAgentToken();
  if (!token) {
    return {
      ok: true,
      mode: "demo",
      data: null,
      reason: `Binance Agent OS not connected. Tool "${tool}" simulated locally.`,
    };
  }

  // Refuse if the last verified probe wasn't CONNECTED. Never fake success.
  const status = await getAgentConnectionStatus();
  if (status.agentConnection !== "CONNECTED") {
    return {
      ok: false,
      error: `Binance Agent OS is not in CONNECTED state (currently ${status.agentConnection}). Refusing to invoke "${tool}".`,
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(AGENT_OS_MCP_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
        method: "tools/call",
        params: { name: tool, arguments: args },
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);
    if (!res.ok) {
      return { ok: false, error: `Agent OS returned ${res.status}` };
    }
    const json = (await res.json()) as { result?: T; error?: { message?: string } };
    if (json.error) return { ok: false, error: json.error.message ?? "MCP error" };
    return { ok: true, mode: "live", data: (json.result ?? null) as T };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export const BINANCE_MCP_URL = AGENT_OS_MCP_URL;
