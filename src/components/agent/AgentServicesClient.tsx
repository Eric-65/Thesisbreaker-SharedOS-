"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Loader2,
  Play,
  RefreshCcw,
  ShieldCheck,
  Terminal,
  XCircle,
} from "lucide-react";
import { BreakCard } from "./BreakCard";
import type { BreakThesisResult, VerifyClaimResult } from "@/lib/decision/types";

interface Manifest {
  product: string;
  tagline: string;
  purpose: string;
  permissions_model: string;
  services: {
    name: "break_thesis" | "verify_claim";
    version: string;
    description: string;
    price_credits: number;
    expected_latency_ms: number;
    timeout_ms: number;
    purpose: string;
    permissions: { allowed: string[]; denied: string[] };
    endpoint: string;
    method: string;
    content_type: string;
    request_schema: unknown;
    response_schema: unknown;
  }[];
  sharedos: {
    state: string;
    executionMode: string;
    policy: string;
    purpose: string;
    nodeId: string | null;
    cloudEndpoint: string | null;
  };
}

interface AuditRow {
  id: string;
  service: string;
  purpose: string;
  outcome: "ALLOWED" | "DENIED" | "ERROR";
  mode: string;
  callerName: string | null;
  requiredCapabilities: string[];
  grantedCapabilities: string[];
  deniedReason: string | null;
  errorMessage: string | null;
  priceCredits: number | null;
  durationMs: number;
  createdAt: string;
}

const BREAK_THESIS_SAMPLE = {
  thesis:
    "Our team should adopt Rust for the ingestion service because it will halve our tail latency and reduce operational cost.",
  context:
    "We currently run Python workers behind Kafka. Ingestion peaks at 40k msgs/sec with p99 latency around 180ms.",
  evidence: [
    "Benchmarks in the eng-blog show Rust workers at p99 60-90ms under similar workloads.",
    "Team has zero production Rust experience today.",
    "Hiring plan does not include additional Rust engineers this quarter.",
  ],
  sources: ["internal://benchmarks/ingest-2026", "internal://roadmap/q1-hiring"],
  domain: "technical",
};

const VERIFY_CLAIM_SAMPLE = {
  claim: "Rewrite in Rust will halve tail latency for this workload.",
  context: "The workload is CPU-bound JSON parsing.",
  evidence: [
    "Similar rewrite in eng-blog moved p99 from 180ms to 65ms.",
    "Migration would take an estimated 6 weeks with 2 engineers.",
  ],
};

const DENIED_SAMPLE_CAPABILITIES = [
  "read:submitted_decision",
  "read:submitted_evidence",
  "invoke:thesisbreaker.reasoning_pipeline",
  "return:verification_result",
  "wallet:sign", // deliberately not allowed → forces DENIED
];

type ServiceOutcome =
  | { kind: "ok"; service: "break_thesis"; result: BreakThesisResult; latencyMs: number }
  | { kind: "ok"; service: "verify_claim"; result: VerifyClaimResult; latencyMs: number }
  | { kind: "denied"; reason: string; latencyMs: number }
  | { kind: "error"; error: string };

export function AgentServicesClient() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [busyService, setBusyService] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ServiceOutcome | null>(null);
  const [refreshingSharedOs, setRefreshingSharedOs] = useState(false);

  const loadManifest = useCallback(async () => {
    const res = await fetch("/api/agent/services").then((r) => r.json());
    if (res?.ok) setManifest(res.data as Manifest);
  }, []);
  const loadAudit = useCallback(async () => {
    const res = await fetch("/api/agent/audit").then((r) => r.json());
    if (res?.ok) setAudit(res.data as AuditRow[]);
  }, []);

  useEffect(() => {
    void loadManifest();
    void loadAudit();
  }, [loadManifest, loadAudit]);

  const call = async (
    service: "break_thesis" | "verify_claim",
    body: unknown,
    extras: { granted?: string[]; purpose?: string; callerName?: string } = {},
  ) => {
    setBusyService(service);
    setOutcome(null);
    const t0 = Date.now();
    try {
      const res = await fetch(`/api/agent/services/${service}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(extras.purpose ? { "x-purpose": extras.purpose } : {}),
          ...(extras.granted ? { "x-granted-capabilities": extras.granted.join(",") } : {}),
          "x-caller-name": extras.callerName ?? "human-tester",
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      const latencyMs = Date.now() - t0;
      if (!json.ok && json.denied) {
        setOutcome({ kind: "denied", reason: json.denied.reason, latencyMs });
      } else if (!json.ok) {
        setOutcome({ kind: "error", error: json.error ?? "unknown error" });
      } else if (service === "break_thesis") {
        setOutcome({
          kind: "ok",
          service,
          result: json.data as BreakThesisResult,
          latencyMs,
        });
      } else {
        setOutcome({
          kind: "ok",
          service,
          result: json.data as VerifyClaimResult,
          latencyMs,
        });
      }
      void loadAudit();
    } catch (err) {
      setOutcome({ kind: "error", error: (err as Error).message });
    } finally {
      setBusyService(null);
    }
  };

  const refreshSharedOs = async () => {
    setRefreshingSharedOs(true);
    try {
      await loadManifest();
    } finally {
      setRefreshingSharedOs(false);
    }
  };

  const services = manifest?.services ?? [];

  return (
    <div className="space-y-6">
      {/* SharedOS status */}
      <div className="surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Cpu size={14} className="text-[#f0b90b]" /> SharedOS
          </div>
          <div className="flex items-center gap-2">
            <SharedOsBadge state={manifest?.sharedos.state ?? "…"} />
            <span className="chip">Policy · {manifest?.sharedos.policy ?? "…"}</span>
            <button
              className="btn btn-secondary text-xs"
              onClick={refreshSharedOs}
              disabled={refreshingSharedOs}
            >
              {refreshingSharedOs ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <RefreshCcw size={12} />
              )}
              Verify
            </button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <KV label="Purpose" value={manifest?.sharedos.purpose ?? "…"} />
          <KV label="Execution Mode" value={manifest?.sharedos.executionMode ?? "…"} />
          <KV label="Node ID" value={manifest?.sharedos.nodeId ?? "(local)"} />
          <KV label="Cloud" value={manifest?.sharedos.cloudEndpoint ?? "(not configured)"} mono />
        </div>
        <p className="mt-3 text-xs text-[#9aa1ae]">
          ThesisBreaker Arena services execute inside SharedOS Cloud when connected. In LOCAL
          mode the exact same deny-by-default grant policy is enforced by the adapter — every
          service call is audited, and denied capabilities never reach the reasoning pipeline.
        </p>
      </div>

      {/* Services grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {services.map((svc) => (
          <ServiceCard
            key={svc.name}
            svc={svc}
            busy={busyService === svc.name}
            onRun={() =>
              call(
                svc.name,
                svc.name === "break_thesis" ? BREAK_THESIS_SAMPLE : VERIFY_CLAIM_SAMPLE,
              )
            }
            onRunWithDenied={() =>
              call(
                svc.name,
                svc.name === "break_thesis" ? BREAK_THESIS_SAMPLE : VERIFY_CLAIM_SAMPLE,
                { granted: DENIED_SAMPLE_CAPABILITIES, callerName: "grants-tester" },
              )
            }
          />
        ))}
      </div>

      {/* Outcome */}
      <AnimatePresence mode="wait">
        {outcome && (
          <motion.div
            key={JSON.stringify(outcome).slice(0, 32)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {outcome.kind === "ok" && outcome.service === "break_thesis" && (
              <>
                <BreakCard result={outcome.result} />
                <JsonPanel value={outcome.result} title="Structured JSON returned to caller" />
              </>
            )}
            {outcome.kind === "ok" && outcome.service === "verify_claim" && (
              <VerifyCard result={outcome.result} />
            )}
            {outcome.kind === "denied" && (
              <div className="surface border-[#7f1d1d] p-4 text-sm">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-[#fca5a5]">
                  <XCircle size={12} /> Denied by deny-by-default policy
                </div>
                <div className="mt-2 text-[#cbd0da]">{outcome.reason}</div>
                <div className="mt-2 text-[11px] text-[#7a8091]">
                  The call was rejected at the grant boundary — the reasoning pipeline never ran.
                </div>
              </div>
            )}
            {outcome.kind === "error" && (
              <div className="surface border-[#7f1d1d] p-4 text-sm">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-[#fca5a5]">
                  <AlertTriangle size={12} /> Error
                </div>
                <div className="mt-2 text-[#cbd0da]">{outcome.error}</div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Audit */}
      <div className="surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#1e222c] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <ShieldCheck size={14} className="text-[#22c55e]" /> Audit trail
          </div>
          <button className="btn btn-secondary text-xs" onClick={loadAudit}>
            <RefreshCcw size={12} /> Refresh
          </button>
        </div>
        {audit.length === 0 ? (
          <div className="p-6 text-center text-sm text-[#5e6472]">No calls recorded yet.</div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-[#1e222c] text-[10px] uppercase tracking-widest text-[#5e6472]">
                  <th className="p-3 text-left">Service</th>
                  <th className="p-3 text-left">Outcome</th>
                  <th className="p-3 text-left">Mode</th>
                  <th className="p-3 text-left">Purpose</th>
                  <th className="p-3 text-left">Caller</th>
                  <th className="p-3 text-right">Credits</th>
                  <th className="p-3 text-right">Latency</th>
                  <th className="p-3 text-left">When</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((r) => (
                  <tr key={r.id} className="border-b border-[#12141b] hover:bg-white/[0.02]">
                    <td className="p-3 font-mono text-xs text-white">{r.service}</td>
                    <td className="p-3">
                      <OutcomeBadge outcome={r.outcome} />
                    </td>
                    <td className="p-3 text-[11px] text-[#9aa1ae]">{r.mode}</td>
                    <td className="p-3 font-mono text-[11px] text-[#9aa1ae]">{r.purpose}</td>
                    <td className="p-3 text-[11px] text-[#9aa1ae]">
                      {r.callerName ?? "—"}
                    </td>
                    <td className="p-3 text-right tabular text-[#f0b90b]">
                      {r.priceCredits ?? "—"}
                    </td>
                    <td className="p-3 text-right tabular text-[#cbd0da]">{r.durationMs}ms</td>
                    <td className="p-3 text-[11px] text-[#7a8091]">
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ServiceCard({
  svc,
  busy,
  onRun,
  onRunWithDenied,
}: {
  svc: Manifest["services"][number];
  busy: boolean;
  onRun: () => void;
  onRunWithDenied: () => void;
}) {
  const curl = useMemo(() => sampleCurl(svc), [svc]);
  const [showCurl, setShowCurl] = useState(false);
  return (
    <div className="surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="font-mono text-sm font-semibold text-white">{svc.name}</div>
            <span className="chip chip-brand">{svc.price_credits} credits</span>
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-widest text-[#5e6472]">
            v{svc.version} · target ~{svc.expected_latency_ms}ms · timeout {svc.timeout_ms / 1000}s
          </div>
        </div>
        <button className="btn btn-primary text-xs" onClick={onRun} disabled={busy}>
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Run demo
        </button>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-[#cbd0da]">{svc.description}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <KV label="Method" value={svc.method} mono />
        <KV label="Path" value={svc.endpoint.replace(/^https?:\/\/[^/]+/, "")} mono />
        <KV label="Purpose" value={svc.purpose} mono />
        <KV label="Content type" value={svc.content_type} mono />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
        <div className="rounded-md border border-[#0f2417] bg-[#062513]/40 p-2">
          <div className="uppercase tracking-widest text-[#86efac]">Allowed</div>
          <ul className="mt-1 space-y-0.5 text-[10px] text-[#cbd0da]">
            {svc.permissions.allowed.map((a) => (
              <li key={a}>· {a}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-md border border-[#3b1414] bg-[#210a0a]/40 p-2">
          <div className="uppercase tracking-widest text-[#fca5a5]">Denied</div>
          <ul className="mt-1 space-y-0.5 text-[10px] text-[#cbd0da]">
            {svc.permissions.denied.map((a) => (
              <li key={a}>· {a}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className="btn btn-secondary text-xs" onClick={onRunWithDenied} disabled={busy}>
          <ShieldCheck size={12} /> Attempt with over-broad grants (expect DENIED)
        </button>
        <button
          className="btn btn-ghost text-xs"
          onClick={() => setShowCurl((v) => !v)}
        >
          <Terminal size={12} /> {showCurl ? "Hide" : "Show"} curl
        </button>
      </div>
      {showCurl && (
        <pre className="mt-2 overflow-x-auto rounded-md border border-[#1e222c] bg-[#07080c] p-3 text-[11px] leading-relaxed text-[#cbd0da]">
{curl}
        </pre>
      )}
    </div>
  );
}

function VerifyCard({ result }: { result: VerifyClaimResult }) {
  const color =
    result.verdict === "SUPPORTED"
      ? "#22c55e"
      : result.verdict === "CONTRADICTED"
        ? "#ef4444"
        : "#9aa1ae";
  return (
    <div className="surface p-5">
      <div className="mb-1 flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[#5e6472]">
          ThesisBreaker · Verify Claim
        </div>
        <span className="text-[10px] text-[#7a8091]">
          Latency {result.latency_ms}ms · {result.demo ? "DEMO EVIDENCE" : "LIVE EVIDENCE"}
        </span>
      </div>
      <div className="flex items-baseline justify-between">
        <span
          className="rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-widest"
          style={{
            borderColor: `${color}55`,
            color,
            background: `${color}12`,
          }}
        >
          {result.verdict}
        </span>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-[#5e6472]">Confidence</div>
          <div className="font-display text-3xl font-semibold tabular text-white">
            {result.confidence}
            <span className="text-lg text-[#5e6472]">/100</span>
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <KV label="Source quality" value={result.source_quality} />
        <KV label="Evidence" value={String(result.evidence.length)} />
        <KV label="Contradictions" value={String(result.contradictions.length)} />
        <KV label="Uncertain" value={String(result.uncertain.length)} />
      </div>
      <div className="mt-4 rounded-md border border-[#1e222c] bg-[#0a0c11] p-3 text-xs text-[#cbd0da]">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[#5e6472]">
          Recommendation
        </div>
        <div className="mt-1 text-white">{result.recommendation}</div>
      </div>
      <div className="mt-2 text-[11px] leading-relaxed text-[#9aa1ae]">{result.summary}</div>
    </div>
  );
}

function JsonPanel({ value, title }: { value: unknown; title: string }) {
  return (
    <div className="surface p-4">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[#5e6472]">
        {title}
      </div>
      <pre className="max-h-96 overflow-auto rounded-md border border-[#1e222c] bg-[#07080c] p-3 text-[11px] leading-relaxed text-[#cbd0da]">
{JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-[#1e222c] bg-[#0a0c11] p-2.5">
      <div className="text-[10px] uppercase tracking-widest text-[#5e6472]">{label}</div>
      <div className={`mt-0.5 text-xs text-white ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function SharedOsBadge({ state }: { state: string }) {
  const s = state === "CONNECTED" ? {
    color: "#22c55e",
    label: "CONNECTED",
  } : state === "CONNECTING" ? {
    color: "#f5b400",
    label: "CONNECTING…",
  } : state === "ERROR" ? {
    color: "#ef4444",
    label: "ERROR",
  } : {
    color: "#9aa1ae",
    label: "LOCAL MODE",
  };
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest"
      style={{
        borderColor: `${s.color}55`,
        color: s.color,
        background: `${s.color}12`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
      SharedOS · {s.label}
    </span>
  );
}

function OutcomeBadge({ outcome }: { outcome: "ALLOWED" | "DENIED" | "ERROR" }) {
  const c =
    outcome === "ALLOWED"
      ? { color: "#22c55e", Icon: CheckCircle2, label: "ALLOWED" }
      : outcome === "DENIED"
        ? { color: "#ef4444", Icon: XCircle, label: "DENIED" }
        : { color: "#f5b400", Icon: AlertTriangle, label: "ERROR" };
  const Icon = c.Icon;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest"
      style={{
        borderColor: `${c.color}55`,
        color: c.color,
        background: `${c.color}12`,
      }}
    >
      <Icon size={10} /> {c.label}
    </span>
  );
}

function sampleCurl(svc: Manifest["services"][number]): string {
  const body =
    svc.name === "break_thesis" ? BREAK_THESIS_SAMPLE : VERIFY_CLAIM_SAMPLE;
  return [
    `curl -X ${svc.method} '${svc.endpoint}' \\`,
    `  -H 'content-type: application/json' \\`,
    `  -H 'x-purpose: ${svc.purpose}' \\`,
    `  -H 'x-granted-capabilities: ${svc.permissions.allowed.join(",")}' \\`,
    `  -d '${JSON.stringify(body)}'`,
  ].join("\n");
}
