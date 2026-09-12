"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  Lock,
  RefreshCcw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type {
  AgentConnectionState,
  AgentConnectionStatus,
  AccountState,
  MarketDataState,
  TradingPermissionState,
} from "@/lib/binance/agent";
import { pushToast } from "../toasts";

const AGENT_LABEL: Record<AgentConnectionState, { label: string; color: string; sub: string }> = {
  CONNECTED: {
    label: "CONNECTED",
    color: "#22c55e",
    sub: "MCP handshake succeeded.",
  },
  CONNECTING: {
    label: "CONNECTING…",
    color: "#f5b400",
    sub: "Verifying MCP session…",
  },
  AUTHORIZING: {
    label: "AUTHORIZING…",
    color: "#f5b400",
    sub: "Waiting for user authorization to complete.",
  },
  AUTHORIZATION_EXPIRED: {
    label: "RECONNECT REQUIRED",
    color: "#ef4444",
    sub: "Authorization has expired or been revoked.",
  },
  RECONNECT_REQUIRED: {
    label: "RECONNECT REQUIRED",
    color: "#ef4444",
    sub: "Session needs to be re-established.",
  },
  ERROR: {
    label: "CONNECTION ERROR",
    color: "#ef4444",
    sub: "MCP endpoint returned an error.",
  },
  DISCONNECTED: {
    label: "NOT CONNECTED",
    color: "#9aa1ae",
    sub: "No credential configured on the server.",
  },
  DEMO: {
    label: "NOT CONNECTED",
    color: "#9aa1ae",
    sub: "Running in Demo Agent mode.",
  },
};

const MARKET_LABEL: Record<MarketDataState, { label: string; color: string; sub: string }> = {
  AVAILABLE: {
    label: "LIVE",
    color: "#22c55e",
    sub: "Public Binance market data reachable.",
  },
  DEGRADED: {
    label: "DEGRADED",
    color: "#f5b400",
    sub: "Public data reachable but returning errors.",
  },
  UNAVAILABLE: {
    label: "UNAVAILABLE",
    color: "#ef4444",
    sub: "Public Binance market data is not reachable from this server.",
  },
};

const ACCOUNT_LABEL: Record<AccountState, { label: string; color: string }> = {
  CONNECTED: { label: "CONNECTED", color: "#22c55e" },
  NOT_CONNECTED: { label: "NOT CONNECTED", color: "#9aa1ae" },
  UNKNOWN: { label: "UNKNOWN", color: "#f5b400" },
};

const TRADING_LABEL: Record<TradingPermissionState, { label: string; color: string }> = {
  AUTHORIZED: { label: "AUTHORIZED", color: "#22c55e" },
  READ_ONLY: { label: "READ-ONLY", color: "#f5b400" },
  NOT_AUTHORIZED: { label: "NOT AUTHORIZED", color: "#9aa1ae" },
  UNKNOWN: { label: "UNKNOWN", color: "#f5b400" },
};

export function SettingsClient({ initial }: { initial: AgentConnectionStatus }) {
  const [status, setStatus] = useState<AgentConnectionStatus>(initial);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string>("");

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/agent/status?force=1").then((r) => r.json());
      if (res?.ok) setStatus(res.data as AgentConnectionStatus);
      setLastSync(new Date().toLocaleTimeString());
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    void sync();
    const id = setInterval(sync, 60_000);
    return () => clearInterval(id);
  }, [sync]);

  const connected = status.agentConnection === "CONNECTED";
  const agentLbl = AGENT_LABEL[status.agentConnection];
  const marketLbl = MARKET_LABEL[status.marketData];
  const accountLbl = ACCOUNT_LABEL[status.account];
  const tradingLbl = TRADING_LABEL[status.trading];

  const onConnect = () => {
    pushToast({
      kind: "info",
      title: "Binance Agent OS authorization",
      body:
        "Binance Agent OS is authorized through the official compatible-agent flow (e.g. ChatGPT, Claude Code, Codex, Cursor). Complete authorization from a supported MCP client, then set BINANCE_AGENT_TOKEN on this server.",
      ms: 9000,
    });
  };

  const onDisconnect = () => {
    pushToast({
      kind: "info",
      title: "Disconnect Binance Agent OS",
      body:
        "Revoke the ThesisBreaker agent from your Binance sub-account, then remove BINANCE_AGENT_TOKEN from the server environment. This app cannot forcibly revoke access on Binance's behalf.",
      ms: 9000,
    });
  };

  return (
    <div className="space-y-6">
      {/* Binance Agent OS master card */}
      <motion.div
        className="surface p-6"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#f0b90b]/40 bg-[#1a1305]">
              <span className="font-display text-lg text-[#f0b90b]">B</span>
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Binance Agent OS</div>
              <div className="text-xs text-[#5e6472]">
                Standardized MCP access · agent.binance.com/mcp/agentic
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusChip label={agentLbl.label} color={agentLbl.color} />
            <span className="chip chip-brand">{status.environment}</span>
          </div>
        </div>

        {/* Three-axis status grid */}
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <AxisRow
            label="Connection"
            value={agentLbl.label}
            color={agentLbl.color}
            hint={agentLbl.sub}
          />
          <AxisRow
            label="Public market data"
            value={marketLbl.label}
            color={marketLbl.color}
            hint={marketLbl.sub}
          />
          <AxisRow
            label="Agent account"
            value={accountLbl.label}
            color={accountLbl.color}
            hint={
              status.account === "CONNECTED"
                ? "Binance Agentic sub-account reachable via MCP."
                : "Agent sub-account context will appear here once connected."
            }
          />
          <AxisRow
            label="Trading permission"
            value={tradingLbl.label}
            color={tradingLbl.color}
            hint={
              status.trading === "AUTHORIZED"
                ? "The connected sub-account reports trading capability."
                : status.trading === "READ_ONLY"
                  ? "Connected in a read-only configuration. Configure trading permissions on the agent sub-account to enable actions."
                  : "No trading capability. Complete Binance authorization and confirm the sub-account trading permissions."
            }
          />
        </div>

        {status.message && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-[#1e222c] bg-[#0a0c11] p-3 text-xs text-[#9aa1ae]">
            <Info size={14} className="mt-0.5 shrink-0 text-[#f0b90b]" />
            <div>
              {status.message}
              {status.lastError && (
                <div className="mt-1 text-[#fca5a5]">Last error: {status.lastError}</div>
              )}
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {!connected ? (
              <button className="btn btn-primary" onClick={onConnect}>
                Connect Binance Agent
              </button>
            ) : (
              <button className="btn btn-secondary" onClick={onDisconnect}>
                <XCircle size={14} /> Disconnect
              </button>
            )}
            <button className="btn btn-secondary text-xs" onClick={sync} disabled={syncing}>
              {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCcw size={12} />}
              Verify Now
            </button>
          </div>
          <div className="text-[10px] uppercase tracking-widest text-[#5e6472]">
            Last verified{" "}
            {status.lastVerified === new Date(0).toISOString()
              ? "—"
              : new Date(status.lastVerified).toLocaleString()}
            {lastSync ? ` · Sync ${lastSync}` : ""}
          </div>
        </div>
      </motion.div>

      {/* Connection audit */}
      <motion.div
        className="surface p-6"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <ShieldCheck size={14} className="text-[#22c55e]" />
          Connection audit
        </div>
        <p className="mt-1 text-xs text-[#9aa1ae]">
          Every value below is derived from a live probe. This app never claims Binance Agent OS
          is connected unless the MCP handshake actually succeeds.
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <AuditRow label="MCP endpoint" value={status.mcpUrl} mono />
          <AuditRow label="Environment" value={status.environment} />
          <AuditRow
            label="Credential present"
            value={status.hasCredential ? "YES" : "NO"}
            color={status.hasCredential ? "#22c55e" : "#9aa1ae"}
          />
          <AuditRow label="Connection state" value={status.agentConnection} color={agentLbl.color} />
          <AuditRow label="Account state" value={status.account} color={accountLbl.color} />
          <AuditRow label="Trading permission" value={status.trading} color={tradingLbl.color} />
          <AuditRow label="Public market data" value={status.marketData} color={marketLbl.color} />
          <AuditRow
            label="Last verified"
            value={
              status.lastVerified === new Date(0).toISOString()
                ? "not yet"
                : new Date(status.lastVerified).toLocaleString()
            }
          />
        </div>
      </motion.div>

      {/* Authorization details */}
      <motion.div
        className="surface p-6"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Lock size={14} className="text-[#5e6472]" />
          Authorization
        </div>
        <p className="mt-1 text-xs text-[#9aa1ae]">
          Per Binance&rsquo;s official Agent OS design, the agent operates inside a dedicated
          Agentic sub-account. It can view balances, positions and transaction history for that
          sub-account plus balance/portfolio info for the main account. It cannot access
          non-trading personal data or perform crypto withdrawals. Users configure permissions
          and can revoke access at any time.
        </p>
        <div className="mt-3 rounded-lg border border-[#1e222c] bg-[#0a0c11] p-3 text-xs text-[#9aa1ae]">
          <div className="flex items-start gap-2">
            <AlertTriangle size={13} className="mt-0.5 shrink-0 text-[#f0b90b]" />
            <div>
              ThesisBreaker does not ask for your Binance password or private API keys. Binance
              Agent OS authorization is completed inside a supported MCP-compatible client (e.g.
              Claude Desktop, ChatGPT, Codex, Cursor) against{" "}
              <code className="rounded bg-[#07080c] px-1">
                agent.binance.com/mcp/agentic
              </code>
              . Once authorized, provide the resulting bearer credential to this server as{" "}
              <code className="rounded bg-[#07080c] px-1">BINANCE_AGENT_TOKEN</code>. The value
              is never sent to the browser or logged.
            </div>
          </div>
        </div>
      </motion.div>

      {/* Sub-account + funding guidance */}
      <motion.div
        className="surface p-6"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.14 }}
      >
        <div className="text-sm font-semibold text-white">Agentic sub-account</div>
        <p className="mt-1 text-xs text-[#9aa1ae]">
          Binance Agent OS trading operates through a dedicated Agentic sub-account, separate
          from your main account. Fund the sub-account from your Binance account management. This
          app cannot move funds between accounts on your behalf.
        </p>
      </motion.div>

      {/* Market Data Providers */}
      <motion.div
        className="surface p-6"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.16 }}
      >
        <div className="text-sm font-semibold text-white">Market data providers</div>
        <p className="mt-1 text-xs text-[#9aa1ae]">
          Prices, volumes, high/low, historical bars and NFT floors come from the following
          providers in priority order. No price is ever fabricated — providers that fail return
          &ldquo;DATA UNAVAILABLE&rdquo; instead of a placeholder.
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <ProviderRow
            provider="Binance"
            scope="Spot crypto (primary)"
            env="Public market data — no key required"
          />
          <ProviderRow
            provider="CoinGecko"
            scope="Crypto fallback + broader coverage"
            env="Optional: COINGECKO_API_KEY"
          />
          <ProviderRow
            provider="OpenSea"
            scope="NFT collections (research only)"
            env="Optional: OPENSEA_API_KEY"
          />
          <ProviderRow
            provider="Binance Agent OS"
            scope="Trading + account context"
            env="BINANCE_AGENT_TOKEN (server-side)"
          />
        </div>
      </motion.div>

      {/* Safety */}
      <motion.div
        className="surface p-6"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <CheckCircle2 size={14} className="text-[#22c55e]" />
          Safety
        </div>
        <ul className="mt-3 space-y-2 text-xs text-[#9aa1ae]">
          <li>
            · ThesisBreaker never silently substitutes Demo Agent for Binance Agent OS. If Agent
            OS is intended and unavailable, the app displays &ldquo;BINANCE AGENT OS UNAVAILABLE&rdquo;
            and refuses the action.
          </li>
          <li>· The app never claims CONNECTED unless the MCP handshake actually succeeded.</li>
          <li>
            · Every action uses a UUID client_order_id for idempotency; duplicate submissions return
            the same order.
          </li>
          <li>
            · ThesisBreaker never executes an action without explicit user approval and a passing
            deterministic risk gate.
          </li>
          <li>· AI analysis is decision support only. Not financial advice.</li>
          <li>
            · ThesisBreaker is an independent product. Not affiliated with, endorsed by, or
            sponsored by Binance.
          </li>
        </ul>
      </motion.div>
    </div>
  );
}

function StatusChip({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest"
      style={{
        borderColor: `${color}55`,
        background: `${color}12`,
        color,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function AxisRow({
  label,
  value,
  color,
  hint,
}: {
  label: string;
  value: string;
  color: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-[#1e222c] bg-[#0a0c11] p-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[#5e6472]">
          {label}
        </div>
        <StatusChip label={value} color={color} />
      </div>
      <div className="mt-1.5 text-[11px] text-[#7a8091]">{hint}</div>
    </div>
  );
}

function AuditRow({
  label,
  value,
  color,
  mono,
}: {
  label: string;
  value: string;
  color?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-[#1e222c] bg-[#0a0c11] px-3 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-[#5e6472]">
        {label}
      </span>
      <span
        className={`${mono ? "font-mono text-[11px]" : "text-xs"} tabular text-white`}
        style={color ? { color } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

function ProviderRow({
  provider,
  scope,
  env,
}: {
  provider: string;
  scope: string;
  env: string;
}) {
  return (
    <div className="rounded-md border border-[#1e222c] bg-[#0a0c11] p-3">
      <div className="text-sm font-semibold text-white">{provider}</div>
      <div className="mt-0.5 text-[11px] text-[#9aa1ae]">{scope}</div>
      <div className="mt-1 text-[10px] uppercase tracking-widest text-[#5e6472]">{env}</div>
    </div>
  );
}
