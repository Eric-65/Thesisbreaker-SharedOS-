"use client";

import type { BreakThesisResult } from "@/lib/decision/types";

/**
 * "Break Card" — the visualization companion to a break_thesis response.
 * Renders a compact card that mirrors the structured JSON returned to a
 * calling agent, so a human demo can show what the agent sees.
 */

const VERDICT_STYLE: Record<
  BreakThesisResult["verdict"],
  { color: string; bg: string; border: string; label: string }
> = {
  SUPPORTED: {
    color: "#22c55e",
    bg: "rgba(34,197,94,0.10)",
    border: "rgba(34,197,94,0.45)",
    label: "SUPPORTED",
  },
  WEAK: {
    color: "#f5b400",
    bg: "rgba(245,180,0,0.10)",
    border: "rgba(245,180,0,0.45)",
    label: "WEAK",
  },
  CONTRADICTED: {
    color: "#ef4444",
    bg: "rgba(239,68,68,0.10)",
    border: "rgba(239,68,68,0.45)",
    label: "CONTRADICTED",
  },
  UNCERTAIN: {
    color: "#9aa1ae",
    bg: "rgba(154,161,174,0.10)",
    border: "rgba(154,161,174,0.35)",
    label: "UNCERTAIN",
  },
};

export function BreakCard({ result }: { result: BreakThesisResult }) {
  const s = VERDICT_STYLE[result.verdict];
  const riskLevel = result.risks.filter((r) => r.severity === "HIGH").length > 0
    ? "HIGH"
    : result.risks.filter((r) => r.severity === "MEDIUM").length > 0
      ? "MEDIUM"
      : "LOW";
  const riskColor = riskLevel === "HIGH" ? "#ef4444" : riskLevel === "MEDIUM" ? "#f5b400" : "#22c55e";

  return (
    <div
      className="surface overflow-hidden p-5"
      style={{ borderColor: s.border, background: s.bg }}
    >
      <div className="mb-1 flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[#5e6472]">
          ThesisBreaker · Break Card
        </div>
        <div className="text-[10px] uppercase tracking-widest text-[#7a8091]">
          {result.demo ? "DEMO EVIDENCE" : "LIVE EVIDENCE"}
        </div>
      </div>
      <div className="flex items-baseline justify-between">
        <span
          className="rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-widest"
          style={{ borderColor: s.border, color: s.color, background: `${s.color}12` }}
        >
          {s.label}
        </span>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-[#5e6472]">Score</div>
          <div className="font-display text-3xl font-semibold tabular text-white">
            {result.score}
            <span className="text-lg text-[#5e6472]">/100</span>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Metric label="Confidence" value={`${result.confidence}%`} color="#e7e9ee" />
        <Metric label="Supporting" value={String(result.supporting_evidence.length)} color="#22c55e" />
        <Metric label="Contradicting" value={String(result.contradicting_evidence.length)} color="#ef4444" />
        <Metric
          label="Assumptions"
          value={String(result.critical_assumptions.length)}
          color="#f0b90b"
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Metric label="Risk" value={riskLevel} color={riskColor} />
        <Metric
          label="Invalidation"
          value={String(result.invalidation_conditions.length)}
          color="#9aa1ae"
        />
      </div>

      <div className="mt-4 rounded-md border border-[#1e222c] bg-[#0a0c11] p-3 text-xs text-[#cbd0da]">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[#5e6472]">
          Recommendation
        </div>
        <div className="mt-1 text-white">{result.recommendation}</div>
      </div>

      <div className="mt-2 text-[11px] leading-relaxed text-[#9aa1ae]">{result.summary}</div>

      <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-widest text-[#5e6472]">
        <span>Domain · {result.domain}</span>
        <span>Latency · {result.latency_ms}ms</span>
      </div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-md border border-[#1e222c] bg-[#0a0c11] p-2.5">
      <div className="text-[10px] uppercase tracking-widest text-[#5e6472]">{label}</div>
      <div className="mt-0.5 tabular text-sm font-semibold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
