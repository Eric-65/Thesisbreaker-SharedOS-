"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Circle,
  Copy,
  Loader2,
  Play,
  RefreshCcw,
  ShieldCheck,
  Terminal,
  XCircle,
  Zap,
} from "lucide-react";

type ServiceName = "free_preview" | "verify_claim" | "break_thesis";

interface ManifestService {
  name: ServiceName;
  summary: string;
  description: string;
  use_when: string;
  price: number;
  currency: string;
  paid: boolean;
  expected_latency: string;
  expected_latency_ms: number;
  input_schema: { properties?: Record<string, { description?: string; type?: string }>; required?: string[] };
  output_schema: { required?: string[] };
  example: { request: Record<string, unknown>; returns: string };
  mcp_tool: string;
  endpoint: string;
}

interface Manifest {
  product: string;
  tagline: string;
  value_proposition: string;
  purpose: string;
  permissions_model: string;
  denied_capabilities: string[];
  services: ManifestService[];
  access: {
    mcp: { command: string; transport: string };
    cli: { command: string; examples: string[] };
  };
  payment: { model: string; instruction: string };
  sharedos?: { kernel: string; policy: string; purpose: string; registration: string };
}

interface Health {
  status: "ready" | "degraded" | "down";
  sharedos: "active" | "error";
  registration: "registered" | "unregistered";
  purpose: string;
  services: Record<ServiceName, { status: string; price_credits: number; last_check_ms?: number }>;
  checks: { name: string; ok: boolean; detail?: string }[];
}

interface Envelope {
  success: boolean;
  service: ServiceName;
  request_id: string;
  price_credits?: number;
  execution: { sharedos: boolean; purpose: string; trace_id: string; duration_ms: number };
  result?: Record<string, unknown>;
  error?: { code: string; message: string; field?: string };
  payment?: { amount: number; memo: string; instruction: string };
}

const ACCENT = "#f0b90b";

const SAMPLES: Record<ServiceName, string> = {
  free_preview: "We should migrate the billing service to event sourcing this quarter.",
  verify_claim: "Postgres logical replication replicates DDL changes automatically.",
  break_thesis: "We should migrate the billing service to event sourcing this quarter.",
};

function Panel({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-white/70">
          {icon}
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function StatusDot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  const color = ok ? "#22c55e" : warn ? ACCENT : "#ef4444";
  return <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />;
}

export function AgentServicesClient() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);

  const [service, setService] = useState<ServiceName>("break_thesis");
  const [input, setInput] = useState(SAMPLES.break_thesis);
  const [running, setRunning] = useState(false);
  const [envelope, setEnvelope] = useState<Envelope | null>(null);
  const [expanded, setExpanded] = useState<ServiceName | null>(null);

  const load = useCallback(async () => {
    try {
      const [manifestRes, healthRes] = await Promise.all([
        fetch("/api/agent/services", { cache: "no-store" }),
        fetch("/api/arena/health", { cache: "no-store" }),
      ]);
      setManifest(await manifestRes.json());
      setHealth(await healthRes.json());
    } catch {
      setManifest(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const selectService = (next: ServiceName) => {
    setService(next);
    setInput(SAMPLES[next]);
    setEnvelope(null);
  };

  const run = async () => {
    setRunning(true);
    setEnvelope(null);
    try {
      const payload =
        service === "verify_claim" ? { claim: input } : { thesis: input };
      const res = await fetch(`/api/agent/services/${service}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-caller-agent-id": "web-test-console",
          "x-caller-name": "Developer Test Console",
        },
        body: JSON.stringify(payload),
      });
      setEnvelope(await res.json());
    } catch (err) {
      setEnvelope({
        success: false,
        service,
        request_id: "—",
        execution: { sharedos: false, purpose: "—", trace_id: "—", duration_ms: 0 },
        error: { code: "network_error", message: (err as Error).message },
      });
    } finally {
      setRunning(false);
    }
  };

  const readiness = useMemo(() => {
    if (!health) return [];
    return [
      { label: "SharedOS connection", ok: health.sharedos === "active" },
      {
        label: "Services available",
        ok: Object.values(health.services).every((s) => s.status === "ready"),
      },
      { label: "MCP available", ok: true },
      { label: "Agent configured", ok: health.registration === "registered" },
      { label: "Audit logging available", ok: health.sharedos === "active" },
      { label: "Arena service ready", ok: health.status === "ready" },
    ];
  }, [health]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-white/60">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading service catalogue…
      </div>
    );
  }

  if (!manifest) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-red-200">
        Could not load the service catalogue.{" "}
        <button onClick={() => void load()} className="underline">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        {/* ---- Services ---- */}
        <Panel title="Services" icon={<Zap className="h-4 w-4" style={{ color: ACCENT }} />}>
          <p className="mb-4 text-sm text-white/60">{manifest.value_proposition}</p>
          <div className="space-y-3">
            {manifest.services.map((s) => {
              const open = expanded === s.name;
              return (
                <motion.div
                  key={s.name}
                  layout
                  className="rounded-xl border border-white/10 bg-black/20"
                >
                  <button
                    onClick={() => setExpanded(open ? null : s.name)}
                    className="flex w-full items-center justify-between gap-4 p-4 text-left"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm text-white">{s.name}</span>
                        <span
                          className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                          style={
                            s.paid
                              ? { background: `${ACCENT}22`, color: ACCENT }
                              : { background: "#22c55e22", color: "#22c55e" }
                          }
                        >
                          {s.paid ? `${s.price} credits` : "Free"}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-white/50">{s.summary}</p>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-white/40 transition-transform ${open ? "rotate-180" : ""}`}
                    />
                  </button>

                  {open && (
                    <div className="space-y-3 border-t border-white/10 p-4 text-xs">
                      <Field label="What it does">{s.description}</Field>
                      <Field label="Use when">{s.use_when}</Field>
                      <Field label="Input">
                        <code className="text-white/70">
                          {(s.input_schema.required ?? []).join(", ") || "—"}
                          {s.input_schema.properties
                            ? ` (optional: ${Object.keys(s.input_schema.properties)
                                .filter((k) => !(s.input_schema.required ?? []).includes(k))
                                .join(", ")})`
                            : ""}
                        </code>
                      </Field>
                      <Field label="Output">
                        <code className="text-white/70">
                          {(s.output_schema.required ?? []).slice(0, 8).join(", ")}
                        </code>
                      </Field>
                      <Field label="Response time">{s.expected_latency}</Field>
                      <Field label="Example call">
                        <pre className="mt-1 overflow-x-auto rounded bg-black/40 p-2 text-[11px] text-white/70">
{JSON.stringify(s.example.request, null, 2)}
                        </pre>
                        <span className="text-white/40">→ {s.example.returns}</span>
                      </Field>
                      <Field label="MCP tool">
                        <code className="text-white/70">{s.mcp_tool}</code>
                      </Field>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </Panel>

        {/* ---- Test console ---- */}
        <Panel
          title="Agent Test Console"
          icon={<Terminal className="h-4 w-4" style={{ color: ACCENT }} />}
          action={<span className="text-[10px] uppercase tracking-wider text-white/30">developer only</span>}
        >
          <div className="mb-3 flex flex-wrap gap-2">
            {manifest.services.map((s) => (
              <button
                key={s.name}
                onClick={() => selectService(s.name)}
                className={`rounded-lg border px-3 py-1.5 font-mono text-xs transition ${
                  service === s.name
                    ? "border-[#f0b90b] bg-[#f0b90b]/10 text-[#f0b90b]"
                    : "border-white/10 text-white/60 hover:border-white/25"
                }`}
              >
                {s.name} · {s.price}
              </button>
            ))}
          </div>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={3}
            placeholder={service === "verify_claim" ? "Claim to verify…" : "Decision or thesis…"}
            className="w-full resize-y rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#f0b90b]/50"
          />

          <button
            onClick={() => void run()}
            disabled={running || input.trim().length === 0}
            className="mt-3 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-black transition disabled:opacity-40"
            style={{ background: ACCENT }}
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? "Running…" : `Call ${service}`}
          </button>

          {envelope && (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <Metric label="Service" value={envelope.service} />
                <Metric label="Price" value={`${envelope.price_credits ?? 0} cr`} />
                <Metric label="Time" value={`${envelope.execution.duration_ms} ms`} />
                <Metric label="SharedOS" value={envelope.execution.sharedos ? "yes" : "no"} />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/40">
                <span>request_id: <code className="text-white/60">{envelope.request_id}</code></span>
                <span>trace_id: <code className="text-white/60">{envelope.execution.trace_id}</code></span>
                <span>purpose: <code className="text-white/60">{envelope.execution.purpose}</code></span>
              </div>

              {envelope.success ? (
                <ResultView result={envelope.result ?? {}} />
              ) : (
                <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-200">
                  <div className="font-mono text-xs uppercase tracking-wider text-red-300">
                    {envelope.error?.code}
                  </div>
                  <div className="mt-1">{envelope.error?.message}</div>
                </div>
              )}

              <details className="rounded-xl border border-white/10 bg-black/30 p-3">
                <summary className="cursor-pointer text-xs text-white/50">Raw JSON response</summary>
                <pre className="mt-2 max-h-80 overflow-auto text-[11px] text-white/70">
{JSON.stringify(envelope, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </Panel>
      </div>

      {/* ---- Sidebar ---- */}
      <div className="space-y-5">
        <Panel
          title="SharedOS"
          icon={<ShieldCheck className="h-4 w-4" style={{ color: ACCENT }} />}
          action={
            <button onClick={() => void load()} className="text-white/40 hover:text-white">
              <RefreshCcw className="h-3.5 w-3.5" />
            </button>
          }
        >
          <dl className="space-y-2 text-xs">
            <Row label="Kernel">
              <span className="flex items-center gap-2">
                <StatusDot ok={health?.sharedos === "active"} />
                {health?.sharedos === "active" ? "Connected" : "Disconnected"}
              </span>
            </Row>
            <Row label="Purpose">
              <code style={{ color: ACCENT }}>{manifest.purpose}</code>
            </Row>
            <Row label="Policy">
              <span className="text-white/70">Deny by default</span>
            </Row>
            <Row label="Registration">
              <span className="flex items-center gap-2">
                <StatusDot ok={health?.registration === "registered"} warn />
                {health?.registration === "registered" ? "Registered" : "Not registered"}
              </span>
            </Row>
          </dl>
          <p className="mt-3 border-t border-white/10 pt-3 text-[11px] leading-relaxed text-white/40">
            Denied by default:{" "}
            <span className="font-mono">{manifest.denied_capabilities.slice(0, 6).join(", ")}</span>
            …
          </p>
        </Panel>

        <Panel title="Arena Readiness" icon={<CheckCircle2 className="h-4 w-4" style={{ color: ACCENT }} />}>
          <ul className="space-y-2 text-xs">
            {readiness.map((item) => (
              <li key={item.label} className="flex items-center gap-2">
                {item.ok ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                ) : (
                  <Circle className="h-3.5 w-3.5 text-white/25" />
                )}
                <span className={item.ok ? "text-white/80" : "text-white/40"}>{item.label}</span>
              </li>
            ))}
          </ul>
          {health?.status === "degraded" && (
            <div className="mt-3 flex gap-2 rounded-lg border border-[#f0b90b]/30 bg-[#f0b90b]/5 p-2 text-[11px] text-[#f0b90b]">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Services execute, but SharedNet registration is incomplete.
            </div>
          )}
          {health?.status === "down" && (
            <div className="mt-3 flex gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-2 text-[11px] text-red-200">
              <XCircle className="h-3.5 w-3.5 shrink-0" />
              Arena service is not ready.
            </div>
          )}
        </Panel>

        <Panel title="Direct Agent Access" icon={<Terminal className="h-4 w-4" style={{ color: ACCENT }} />}>
          <div className="space-y-3 text-[11px]">
            <div>
              <div className="mb-1 uppercase tracking-wider text-white/40">MCP (stdio)</div>
              <CopyLine text={manifest.access.mcp.command} />
            </div>
            <div>
              <div className="mb-1 uppercase tracking-wider text-white/40">CLI</div>
              {manifest.access.cli.examples.map((example) => (
                <CopyLine key={example} text={example} />
              ))}
            </div>
            <p className="border-t border-white/10 pt-3 leading-relaxed text-white/40">
              No browser required. The web UI is for inspection — agents call the service directly.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 text-[10px] uppercase tracking-wider text-white/35">{label}</div>
      <div className="text-white/70">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-white/40">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-2">
      <div className="text-[10px] uppercase tracking-wider text-white/35">{label}</div>
      <div className="mt-0.5 font-mono text-white/90">{value}</div>
    </div>
  );
}

function CopyLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="group mb-1 flex w-full items-center justify-between gap-2 rounded border border-white/10 bg-black/30 px-2 py-1.5 text-left font-mono text-white/70 hover:border-white/25"
    >
      <span className="truncate">{text}</span>
      {copied ? (
        <CheckCircle2 className="h-3 w-3 shrink-0 text-green-400" />
      ) : (
        <Copy className="h-3 w-3 shrink-0 text-white/25 group-hover:text-white/50" />
      )}
    </button>
  );
}

function ResultView({ result }: { result: Record<string, unknown> }) {
  const verdict = typeof result.verdict === "string" ? result.verdict : null;
  const score = typeof result.score === "number" ? result.score : null;
  const summary = typeof result.summary === "string" ? result.summary : null;
  const recommendation =
    typeof result.recommendation === "string" ? result.recommendation : null;
  const weaknesses = Array.isArray(result.top_weaknesses)
    ? (result.top_weaknesses as string[])
    : null;

  const verdictColor =
    verdict === "SUPPORTED" ? "#22c55e" : verdict === "CONTRADICTED" ? "#ef4444" : ACCENT;

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-4">
      <div className="flex flex-wrap items-baseline gap-3">
        {verdict && (
          <span className="font-display text-2xl" style={{ color: verdictColor }}>
            {verdict}
          </span>
        )}
        {score !== null && <span className="font-mono text-sm text-white/60">{score}/100</span>}
      </div>
      {summary && <p className="mt-2 text-sm text-white/70">{summary}</p>}
      {weaknesses && weaknesses.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-white/60">
          {weaknesses.map((w) => (
            <li key={w} className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" style={{ color: ACCENT }} />
              {w}
            </li>
          ))}
        </ul>
      )}
      {recommendation && (
        <p className="mt-3 border-t border-white/10 pt-3 text-sm text-white/80">
          <span className="text-[10px] uppercase tracking-wider text-white/35">Recommendation</span>
          <br />
          {recommendation}
        </p>
      )}
    </div>
  );
}
