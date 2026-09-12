"use client";

import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import type {
  AgentConnectionState,
  AgentConnectionStatus,
  MarketDataState,
} from "@/lib/binance/agent";

/** Two honest, independent axes. Never blended into a single misleading
 * "LIVE" badge:
 *   AGENT → DEMO / CONNECTING / BINANCE / RECONNECT / ERROR
 *   DATA  → LIVE PUBLIC / DEGRADED / UNAVAILABLE
 */

async function probe(): Promise<AgentConnectionStatus | null> {
  try {
    const res = await fetch("/api/agent/status").then((r) => r.json());
    return res?.ok ? (res.data as AgentConnectionStatus) : null;
  } catch {
    return null;
  }
}

interface Pill {
  label: string;
  color: string;
  title: string;
}

function agentPill(state: AgentConnectionState, environment: string): Pill {
  switch (state) {
    case "CONNECTED":
      return {
        label: "BINANCE AGENT",
        color: "#f0b90b",
        title:
          "Binance Agent OS is connected. Approved actions can be routed through the MCP endpoint.",
      };
    case "CONNECTING":
      return {
        label: "VERIFYING AGENT…",
        color: "#f5b400",
        title: "Verifying the Binance Agent OS MCP session.",
      };
    case "AUTHORIZING":
      return {
        label: "AUTHORIZING…",
        color: "#f5b400",
        title: "Waiting for Binance Agent OS authorization to complete.",
      };
    case "AUTHORIZATION_EXPIRED":
    case "RECONNECT_REQUIRED":
      return {
        label: "RECONNECT AGENT",
        color: "#ef4444",
        title:
          "Binance Agent OS authorization expired or requires reconnection. Actions cannot be submitted until reconnected.",
      };
    case "ERROR":
      return {
        label: "AGENT ERROR",
        color: "#ef4444",
        title:
          "Binance Agent OS is unreachable. The app is running in Demo Agent mode until the connection recovers.",
      };
    case "DEMO":
    case "DISCONNECTED":
    default:
      return {
        label: "DEMO AGENT",
        color: "#9aa1ae",
        title:
          environment === "DEMO"
            ? "Running in Demo Agent mode. Actions are simulated and clearly labeled — no live Binance action is sent."
            : "Binance Agent OS is not connected.",
      };
  }
}

function dataPill(state: MarketDataState): Pill {
  switch (state) {
    case "AVAILABLE":
      return {
        label: "LIVE PUBLIC DATA",
        color: "#22c55e",
        title:
          "Public Binance market data is reachable. Prices, volumes and candlesticks are real.",
      };
    case "DEGRADED":
      return {
        label: "DATA DEGRADED",
        color: "#f5b400",
        title: "Public Binance market data is reachable but returning errors.",
      };
    case "UNAVAILABLE":
    default:
      return {
        label: "DEMO DATA",
        color: "#f5b400",
        title:
          "Public Binance market data is not currently reachable. Market panels show demo values, clearly labeled.",
      };
  }
}

export function SystemStatusBadges({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<AgentConnectionStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await probe();
      if (!cancelled) setStatus(s);
    })();
    const id = setInterval(async () => {
      const s = await probe();
      if (!cancelled && s) setStatus(s);
    }, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // While we haven't got a first probe back, show conservative Demo/loading pills
  // rather than fabricating "CONNECTED".
  const agent = status
    ? agentPill(status.agentConnection, status.environment)
    : { label: "DEMO AGENT", color: "#9aa1ae", title: "Loading agent status…" };
  const data = status
    ? dataPill(status.marketData)
    : { label: "DATA …", color: "#5e6472", title: "Loading market data status…" };

  return (
    <div className={`flex items-center gap-1.5 ${compact ? "" : "gap-2"}`}>
      <StatusPill pill={agent} />
      <StatusPill pill={data} dot />
    </div>
  );
}

function StatusPill({ pill, dot }: { pill: Pill; dot?: boolean }) {
  const { label, color, title } = pill;
  return (
    <span
      title={title}
      className="group relative inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest"
      style={{
        borderColor: `${color}55`,
        background: `${color}12`,
        color,
      }}
    >
      <span className="relative flex h-1.5 w-1.5">
        {dot && (
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
            style={{ background: color }}
          />
        )}
        <span
          className="relative inline-flex h-1.5 w-1.5 rounded-full"
          style={{ background: color }}
        />
      </span>
      {label}
      <Info size={9} className="opacity-40 group-hover:opacity-90" />
    </span>
  );
}
