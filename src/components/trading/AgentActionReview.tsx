"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";
import type { RiskGateResult } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  thesisId: string;
  symbol: string;
  direction: "long" | "short";
  positionSize: string;
  score: number;
  tradeReadiness: number;
  verdictStatus: string;
  onSubmitted?: (result: { id: string; agentOrderId: string | null; status: string; mode: string }) => void;
}

type Stage = "loading" | "preview" | "submitting" | "submitted" | "blocked" | "error";

interface AgentStatusInfo {
  agentConnection: string;
  environment: string;
  message: string;
}

interface Proposal {
  symbol: string;
  side: string;
  entry: number;
  stop: number;
  target: number;
  size: number;
  notional: number;
  risk: number;
  reward: number;
  rewardToRisk: number;
  currency: string;
  venue: string;
}

interface PreviewData {
  thesis: {
    id: string;
    symbol: string;
    direction: string;
    score: number;
    verdict: { status: string; score: number; tradeReadiness: number };
    positionSize: string;
  };
  proposal: Proposal | null;
  gate: RiskGateResult;
  agent: AgentStatusInfo;
}

/**
 * "REVIEW BINANCE ACTION" modal — core review-and-approve modal.
 * Explicit user approval is required before anything is sent to Binance
 * Agent OS, and if Agent OS is not connected the app never silently
 * substitutes a demo action.
 */
export function AgentActionReview({
  open,
  onClose,
  thesisId,
  symbol,
  direction,
  score,
  tradeReadiness,
  verdictStatus,
  onSubmitted,
}: Props) {
  const [stage, setStage] = useState<Stage>("loading");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{
    id: string;
    agentOrderId: string | null;
    status: string;
    mode: string;
    symbol: string;
    side: string;
    qty: string;
  } | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>("");
  const [executionMode, setExecutionMode] = useState<"agent" | "demo">("agent");

  useEffect(() => {
    if (!open) return;
    setIdempotencyKey(`tb_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`);
    setStage("loading");
    setPreview(null);
    setError(null);
    setSubmitted(null);
    (async () => {
      try {
        const res = await fetch(`/api/theses/${thesisId}/proposal`, { method: "POST" });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error ?? "Proposal failed");
        setPreview(json.data);
        setExecutionMode(json.data.agent?.agentConnection === "CONNECTED" ? "agent" : "demo");
        setStage(json.data.gate.ok ? "preview" : "blocked");
      } catch (err) {
        setError((err as Error).message);
        setStage("error");
      }
    })();
  }, [open, thesisId]);

  const submit = async () => {
    if (!preview) return;
    setStage("submitting");
    setError(null);
    try {
      const res = await fetch(`/api/theses/${thesisId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey, executionMode }),
      });
      const json = await res.json();
      if (!json.ok) {
        if (json.blocked) {
          setPreview((p) => (p && json.gate ? { ...p, gate: json.gate } : p));
          setStage("blocked");
          setError(json.reason ?? "Risk gate blocked the action.");
          return;
        }
        throw new Error(json.error ?? "Action failed");
      }
      setSubmitted({
        id: json.data.id,
        agentOrderId: json.data.alpacaOrderId,
        status: json.data.status,
        mode: json.mode,
        symbol: json.data.symbol,
        side: json.data.side,
        qty: json.data.qty,
      });
      setStage("submitted");
      onSubmitted?.({
        id: json.data.id,
        agentOrderId: json.data.alpacaOrderId,
        status: json.data.status,
        mode: json.mode,
      });
    } catch (err) {
      setError((err as Error).message);
      setStage("error");
    }
  };

  const agentConnected = preview?.agent?.agentConnection === "CONNECTED";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="surface relative w-full max-w-lg overflow-hidden p-0"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-[#9aa1ae] hover:bg-white/5 hover:text-white"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={16} />
            </button>

            <div className="flex flex-wrap items-center gap-2 border-b border-[#1e222c] bg-[#08090d] px-6 py-3">
              <span className="chip chip-brand">Review Binance Action</span>
              {agentConnected ? (
                <span className="chip chip-brand">Binance Agent OS · Connected</span>
              ) : preview?.agent?.agentConnection === "AUTHORIZATION_EXPIRED" ||
                preview?.agent?.agentConnection === "RECONNECT_REQUIRED" ? (
                <span className="chip chip-bear">Reconnect Required</span>
              ) : preview?.agent?.agentConnection === "ERROR" ? (
                <span className="chip chip-bear">Connection Error</span>
              ) : (
                <span className="chip">Demo Agent</span>
              )}
              {agentConnected && executionMode === "demo" && (
                <span className="chip">Demo Executor</span>
              )}
              <div className="ml-auto text-[10px] uppercase tracking-widest text-[#5e6472]">
                {symbol.toUpperCase()} · {direction.toUpperCase()}
              </div>
            </div>

            <div className="p-6">
              {stage === "loading" && (
                <div className="flex items-center gap-3 py-8 text-sm text-[#9aa1ae]">
                  <Loader2 size={16} className="animate-spin" /> Building execution proposal &
                  running risk gate…
                </div>
              )}

              {stage === "error" && (
                <div className="flex items-center gap-2 rounded-lg border border-[#7f1d1d] bg-[#210a0a] p-3 text-sm text-[#fca5a5]">
                  <AlertTriangle size={14} /> {error ?? "Something went wrong."}
                </div>
              )}

              {(stage === "preview" || stage === "submitting" || stage === "blocked") &&
                preview && (
                  <>
                    {!agentConnected && (
                      <div className="mb-3 rounded-lg border border-[#a67c00] bg-[#231a05] p-3 text-xs text-[#fcd34d]">
                        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest">
                          <AlertTriangle size={12} />{" "}
                          {preview?.agent?.agentConnection === "AUTHORIZATION_EXPIRED" ||
                          preview?.agent?.agentConnection === "RECONNECT_REQUIRED"
                            ? "Binance Agent OS authorization expired"
                            : preview?.agent?.agentConnection === "ERROR"
                              ? "Binance Agent OS unreachable"
                              : "Binance Agent OS not connected"}
                        </div>
                        <p className="mt-1">
                          {preview?.agent?.agentConnection === "AUTHORIZATION_EXPIRED" ||
                          preview?.agent?.agentConnection === "RECONNECT_REQUIRED"
                            ? "Reconnect through the official Binance Agent OS authorization flow (from a supported MCP client) to re-enable real actions."
                            : "Real actions require a verified Binance Agent OS session. Complete authorization from a supported MCP client (Claude Desktop, ChatGPT, Codex, Cursor) and provide the resulting bearer credential to this server as BINANCE_AGENT_TOKEN."}{" "}
                          To proceed anyway with an explicit demo agent simulation, confirm below.
                        </p>
                        <label className="mt-2 flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={executionMode === "demo"}
                            onChange={(e) => setExecutionMode(e.target.checked ? "demo" : "agent")}
                          />
                          <span>Use Demo Agent (simulated, clearly labeled)</span>
                        </label>
                      </div>
                    )}

                    {preview.proposal && (
                      <div className="grid grid-cols-2 gap-3">
                        <Cell label="Symbol" value={preview.proposal.symbol} />
                        <Cell
                          label="Side"
                          value={preview.proposal.side}
                          color={preview.proposal.side === "BUY" ? "#22c55e" : "#ef4444"}
                        />
                        <Cell
                          label="Entry"
                          value={fmt(preview.proposal.entry, preview.proposal.currency)}
                        />
                        <Cell
                          label="Stop"
                          value={fmt(preview.proposal.stop, preview.proposal.currency)}
                        />
                        <Cell
                          label="Target"
                          value={fmt(preview.proposal.target, preview.proposal.currency)}
                        />
                        <Cell
                          label="Size"
                          value={preview.proposal.size.toLocaleString(undefined, {
                            maximumFractionDigits: 6,
                          })}
                        />
                        <Cell
                          label="Notional"
                          value={fmt(preview.proposal.notional, preview.proposal.currency)}
                        />
                        <Cell
                          label="R/R"
                          value={preview.proposal.rewardToRisk.toFixed(2)}
                          color={preview.proposal.rewardToRisk >= 1.5 ? "#22c55e" : "#f5b400"}
                        />
                        <Cell
                          label="Thesis Score"
                          value={`${score}/100`}
                          color={score >= 75 ? "#22c55e" : score >= 60 ? "#f5b400" : "#ef4444"}
                        />
                        <Cell
                          label="Trade Readiness"
                          value={`${tradeReadiness}/100`}
                          color={
                            tradeReadiness >= 70
                              ? "#22c55e"
                              : tradeReadiness >= 45
                                ? "#f5b400"
                                : "#ef4444"
                          }
                        />
                      </div>
                    )}

                    <div className="mt-3 rounded-md border border-[#1e222c] bg-[#0a0c11] p-2.5 text-[11px] text-[#9aa1ae]">
                      Venue: <span className="text-white">{preview.proposal?.venue ?? "—"}</span>
                    </div>

                    <div className="mt-4">
                      <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-[#5e6472]">
                        <ShieldCheck size={12} /> Risk Gate
                      </div>
                      <ul className="space-y-1.5">
                        {preview.gate.checks.map((c) => (
                          <li
                            key={c.key}
                            className="flex items-start gap-2 rounded-md border border-[#1e222c] bg-[#0a0c11] p-2 text-xs"
                          >
                            {c.status === "PASS" ? (
                              <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-[#22c55e]" />
                            ) : c.status === "WARN" ? (
                              <AlertTriangle size={13} className="mt-0.5 shrink-0 text-[#f5b400]" />
                            ) : (
                              <XCircle size={13} className="mt-0.5 shrink-0 text-[#ef4444]" />
                            )}
                            <div className="flex-1">
                              <div className="text-[#cbd0da]">{c.label}</div>
                              <div className="text-[11px] text-[#7a8091]">{c.detail}</div>
                            </div>
                            <span
                              className="text-[10px] font-semibold uppercase tracking-widest"
                              style={{
                                color:
                                  c.status === "PASS"
                                    ? "#22c55e"
                                    : c.status === "WARN"
                                      ? "#f5b400"
                                      : "#ef4444",
                              }}
                            >
                              {c.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {stage === "blocked" && (
                      <div className="mt-4 rounded-lg border border-[#7f1d1d] bg-[#210a0a] p-3 text-sm text-[#fca5a5]">
                        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest">
                          <AlertTriangle size={12} /> Action blocked
                        </div>
                        <div className="mt-1 text-xs">
                          {error ?? preview.gate.blockedReason ?? "Risk gate did not pass."}
                        </div>
                      </div>
                    )}

                    <div className="mt-5 flex justify-end gap-2">
                      <button
                        className="btn btn-secondary"
                        onClick={onClose}
                        disabled={stage === "submitting"}
                      >
                        Reject
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={submit}
                        disabled={
                          stage !== "preview" ||
                          !preview.gate.ok ||
                          (!agentConnected && executionMode !== "demo")
                        }
                      >
                        {stage === "submitting" ? (
                          <>
                            <Loader2 size={14} className="animate-spin" /> Submitting…
                          </>
                        ) : (
                          "Approve Action"
                        )}
                      </button>
                    </div>
                  </>
                )}

              {stage === "submitted" && submitted && (
                <div className="text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#166534] bg-[#062513] text-[#86efac]">
                    <CheckCircle2 size={28} />
                  </div>
                  <h3 className="mt-4 font-display text-2xl text-white">Action Approved</h3>
                  <p className="mt-1 text-sm text-[#9aa1ae]">
                    {submitted.mode === "live"
                      ? "Submitted to Binance Agent OS."
                      : "Simulated via Demo Agent — not a real Binance action."}
                  </p>
                  <div className="mt-4 space-y-1.5 rounded-lg border border-[#1e222c] bg-[#07080c] p-4 text-left text-xs">
                    <Row label="Agent Order ID" value={submitted.agentOrderId ?? "—"} mono />
                    <Row label="Symbol" value={submitted.symbol} />
                    <Row label="Side" value={submitted.side.toUpperCase()} />
                    <Row label="Size" value={submitted.qty} />
                    <Row
                      label="Status"
                      value={submitted.status.toUpperCase()}
                      colored="#22c55e"
                    />
                    <Row label="Created" value={new Date().toLocaleString()} />
                  </div>
                  <div className="mt-5 flex justify-end">
                    <button className="btn btn-secondary" onClick={onClose}>
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Cell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-[#1e222c] bg-[#0a0c11] p-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-[#5e6472]">
        {label}
      </div>
      <div
        className="mt-1 tabular text-sm font-semibold text-white"
        style={color ? { color } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  colored,
  mono,
}: {
  label: string;
  value: string;
  colored?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-[#5e6472]">{label}</span>
      <span
        className={`${mono ? "font-mono" : ""} tabular text-white`}
        style={colored ? { color: colored } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

function fmt(v: number | null | undefined, currency: string): string {
  if (v == null) return "—";
  const sym = currency === "USD" || currency === "USDT" || currency === "USDC" ? "$" : "";
  return `${sym}${v.toLocaleString(undefined, {
    minimumFractionDigits: Math.abs(v) < 1 ? 4 : 2,
    maximumFractionDigits: Math.abs(v) < 1 ? 4 : 2,
  })}`;
}
