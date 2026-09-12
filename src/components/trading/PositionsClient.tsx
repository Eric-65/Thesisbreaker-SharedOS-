"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Loader2, RefreshCcw, Star, Trash2 } from "lucide-react";
import { LivePrice } from "../market/LivePrice";

interface AgentStatus {
  agentConnection: string;
  environment: string;
  mcpUrl: string;
  message: string;
}

interface WatchItem {
  id: string;
  symbol: string;
  assetType: "STOCK" | "ETF" | "CRYPTO" | "NFT_COLLECTION" | string;
  displayName: string;
}

interface ThesisLink {
  id: string;
  symbol: string;
  currentScore: number;
  initialScore: number;
  status: string;
  originalText: string;
}

interface OrderRow {
  id: string;
  alpacaOrderId: string | null;
  clientOrderId: string;
  symbol: string;
  side: string;
  qty: string;
  status: string;
  mode: string;
  estimatedPrice: string | null;
  estimatedNotional: string | null;
  createdAt: string;
}

export function PositionsClient() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [watch, setWatch] = useState<WatchItem[]>([]);
  const [theses, setTheses] = useState<ThesisLink[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [lastSynced, setLastSynced] = useState<string>("");
  const [syncing, setSyncing] = useState(false);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const [ag, wl, th] = await Promise.all([
        fetch("/api/agent/status").then((r) => r.json()).catch(() => null),
        fetch("/api/watchlist").then((r) => r.json()).catch(() => null),
        fetch("/api/theses").then((r) => r.json()).catch(() => null),
      ]);
      if (ag?.ok) setStatus(ag.data);
      if (wl?.ok && Array.isArray(wl.data)) setWatch(wl.data as WatchItem[]);
      if (th?.ok && Array.isArray(th.data)) {
        setTheses(
          th.data.map((t: ThesisLink) => ({
            id: t.id,
            symbol: t.symbol,
            currentScore: t.currentScore,
            initialScore: t.initialScore,
            status: t.status,
            originalText: t.originalText,
          })),
        );
        // Aggregate approved-order rows across theses for the "Recent agent actions" panel.
        // We don't have a bulk /orders endpoint yet — accumulate per-thesis in a follow-up
        // request only when the thesis is APPROVED to keep the request count small.
        const approved = (th.data as ThesisLink[]).filter((t) => t.status === "APPROVED");
        if (approved.length > 0) {
          const detailed = await Promise.all(
            approved.map((t) =>
              fetch(`/api/theses/${t.id}`).then((r) => r.json()).catch(() => null),
            ),
          );
          const acc: OrderRow[] = [];
          for (const d of detailed) {
            if (d?.ok && Array.isArray(d.data?.orders)) {
              for (const o of d.data.orders) acc.push(o as OrderRow);
            }
          }
          setOrders(
            acc.sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            ),
          );
        } else {
          setOrders([]);
        }
      }
      setLastSynced(new Date().toLocaleTimeString());
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    void sync();
  }, [sync]);

  const connected = status?.agentConnection === "CONNECTED";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 pb-4">
        {connected ? (
          <span className="chip chip-brand">Binance Agent OS · Connected</span>
        ) : status?.agentConnection === "AUTHORIZATION_EXPIRED" ||
          status?.agentConnection === "RECONNECT_REQUIRED" ? (
          <span className="chip chip-bear">Reconnect Required</span>
        ) : status?.agentConnection === "ERROR" ? (
          <span className="chip chip-bear">Connection Error</span>
        ) : (
          <span className="chip">Demo Agent · Not Connected</span>
        )}
        <span className="chip chip-brand">{status?.environment ?? "…"}</span>
        <span className="text-[10px] uppercase tracking-widest text-[#5e6472]">
          Last synced {lastSynced || "—"}
        </span>
        <button className="btn btn-secondary ml-auto text-xs" onClick={sync} disabled={syncing}>
          {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCcw size={12} />}
          Sync Now
        </button>
      </div>

      {/* Agent account context */}
      {!connected ? (
        <div className="surface flex flex-col items-center gap-3 p-14 text-center">
          <AlertTriangle size={20} className="text-[#f0b90b]" />
          <div className="max-w-md text-sm text-[#9aa1ae]">
            No agent-managed positions are currently available.
            <br />
            Connect <span className="text-white">Binance Agent OS</span> to see your agent
            sub-account balances, positions and orders here. ThesisBreaker never displays
            fabricated account data.
          </div>
          <Link href="/settings" className="btn btn-primary">
            Connect Binance Agent OS
          </Link>
        </div>
      ) : (
        <div className="surface p-6 text-sm text-[#9aa1ae]">
          <div className="text-[10px] uppercase tracking-widest text-[#5e6472]">
            Agent Account Context
          </div>
          <div className="mt-2">
            Live agent sub-account data will appear here once the MCP account-context calls
            are wired to your agent. ThesisBreaker keeps a strict separation: this panel
            reflects what Binance reports for the agent sub-account only.
          </div>
        </div>
      )}

      {/* Recent agent actions */}
      <motion.div
        className="mt-6 surface overflow-hidden"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="border-b border-[#1e222c] p-4 text-sm font-semibold text-white">
          Recent Agent Actions
        </div>
        {orders.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#5e6472]">
            No approved agent actions yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-[#1e222c] text-[10px] uppercase tracking-widest text-[#5e6472]">
                  <th className="p-3 text-left">Agent Order ID</th>
                  <th className="p-3 text-left">Symbol</th>
                  <th className="p-3 text-left">Side</th>
                  <th className="p-3 text-right">Qty</th>
                  <th className="p-3 text-right">Entry (est.)</th>
                  <th className="p-3 text-left">Mode</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-left">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-[#12141b] hover:bg-white/[0.02]">
                    <td className="p-3 font-mono text-xs text-white">
                      {o.alpacaOrderId ?? o.id.slice(0, 8)}
                    </td>
                    <td className="p-3 font-mono font-semibold text-white">{o.symbol}</td>
                    <td className="p-3">
                      <span className={o.side === "buy" ? "chip chip-bull" : "chip chip-bear"}>
                        {o.side.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-3 text-right tabular">{o.qty}</td>
                    <td className="p-3 text-right tabular">
                      ${Number(o.estimatedPrice ?? 0).toFixed(2)}
                    </td>
                    <td className="p-3">
                      <span className={o.mode === "live" ? "chip chip-brand" : "chip"}>
                        {o.mode === "live" ? "BINANCE AGENT" : "DEMO AGENT"}
                      </span>
                    </td>
                    <td className="p-3">
                      <span
                        className={
                          o.status === "filled" || o.status === "FILLED"
                            ? "chip chip-bull"
                            : o.status === "rejected" || o.status === "canceled"
                              ? "chip chip-bear"
                              : "chip chip-warn"
                        }
                      >
                        {o.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-3 text-[#7a8091]">
                      {new Date(o.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Watchlist */}
      <div className="mt-6 surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#1e222c] p-4">
          <div className="flex items-center gap-2">
            <Star size={14} className="text-[#f0b90b]" />
            <div className="text-sm font-semibold text-white">Watchlist</div>
            <span className="text-xs text-[#5e6472]">({watch.length})</span>
          </div>
          <Link href="/market" className="text-xs text-[#9aa1ae] hover:text-white">
            Add from Markets →
          </Link>
        </div>
        {watch.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-[#5e6472]">
            No watchlist yet.{" "}
            <Link href="/market" className="text-[#9aa1ae] hover:text-white">
              Add symbols from Markets →
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-[#12141b]">
            {watch.map((w) => (
              <li key={w.id} className="flex items-center gap-3 p-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md border border-[#1e222c] bg-[#0b0d12] font-mono text-[11px] font-bold">
                  {w.symbol.split("/")[0].slice(0, 3)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-white">{w.symbol}</span>
                    <span className="text-xs text-[#5e6472]">· {w.displayName}</span>
                    <span className="chip">{String(w.assetType).replace("_", " ")}</span>
                  </div>
                </div>
                {w.assetType !== "NFT_COLLECTION" && (
                  <div className="hidden min-w-[180px] items-center justify-end md:flex">
                    <LivePrice
                      symbol={w.symbol}
                      assetType={w.assetType === "CRYPTO" ? "CRYPTO" : "STOCK"}
                      compact
                      refreshMs={25000}
                    />
                  </div>
                )}
                <Link
                  href={`/new?symbol=${encodeURIComponent(w.symbol)}&assetType=${w.assetType}`}
                  className="btn btn-secondary text-xs"
                >
                  Break Thesis
                </Link>
                <button
                  className="rounded-md p-2 text-[#7a8091] hover:bg-white/5 hover:text-[#fca5a5]"
                  onClick={async () => {
                    await fetch(
                      `/api/watchlist?symbol=${encodeURIComponent(w.symbol)}`,
                      { method: "DELETE" },
                    );
                    setWatch((xs) => xs.filter((x) => x.symbol !== w.symbol));
                  }}
                  aria-label="Remove from watchlist"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Reference thesis-linked scores (kept from previous product) */}
      {theses.length > 0 && (
        <div className="mt-6 surface overflow-hidden">
          <div className="border-b border-[#1e222c] p-4 text-sm font-semibold text-white">
            Active Theses
          </div>
          <ul className="divide-y divide-[#12141b]">
            {theses.slice(0, 8).map((t) => (
              <li key={t.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-white">{t.symbol}</span>
                    <span className="chip">{t.status.replace("_", " ")}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-[#7a8091] line-clamp-1">
                    &ldquo;{t.originalText}&rdquo;
                  </div>
                </div>
                <div className="tabular text-sm text-[#cbd0da]">
                  {t.initialScore} →{" "}
                  <span
                    style={{
                      color:
                        t.currentScore >= t.initialScore ? "#22c55e" : "#ef4444",
                    }}
                  >
                    {t.currentScore}
                  </span>
                </div>
                <Link href={`/thesis/${t.id}`} className="btn btn-secondary text-xs">
                  Open →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
