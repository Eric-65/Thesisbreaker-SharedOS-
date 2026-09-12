"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Cpu, ShieldCheck, Zap } from "lucide-react";

/**
 * Landing section that positions ThesisBreaker as an agent-callable service
 * on SharedNet — not just a human product. Introduces both Arena services
 * with their prices and links to the /agent explorer.
 */
export function ForAgents() {
  return (
    <section className="relative mx-auto max-w-7xl px-5 py-20 md:px-8">
      <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#f0b90b]/40 bg-[#1a1305]/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#f0b90b]">
            <Cpu size={12} /> For Agents · SharedNet
          </div>
          <h2 className="font-display text-4xl leading-[1.05] text-white md:text-5xl">
            Break a decision <br />
            <span className="text-[#f0b90b]">before an agent acts on it.</span>
          </h2>
          <p className="mt-4 max-w-lg text-[#9aa1ae]">
            ThesisBreaker exposes two agent-callable services. Another agent on SharedNet
            sends a decision or claim and receives a structured verdict — usable as the
            middle step of any autonomous workflow. Every call runs as a SharedOS agent
            turn with deny-by-default grants and a full audit trail.
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <ServiceTile
              name="break_thesis"
              price={10}
              description="Full stress-test with assumptions, evidence, contradictions and invalidation conditions."
            />
            <ServiceTile
              name="verify_claim"
              price={5}
              description="Fast SUPPORTED / CONTRADICTED / UNCERTAIN verdict on a single claim."
            />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link href="/agent" className="btn btn-primary">
              Open Agent Services <ArrowRight size={14} />
            </Link>
            <a
              href="/api/agent/services"
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary"
            >
              View service manifest (JSON)
            </a>
          </div>
        </div>

        <motion.div
          className="surface p-5"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-[#5e6472]">
            <span>Sample call · break_thesis</span>
            <span className="chip chip-brand">10 credits</span>
          </div>
          <pre className="overflow-auto rounded-md border border-[#1e222c] bg-[#07080c] p-3 text-[11px] leading-relaxed text-[#cbd0da]">
{`POST /api/agent/services/break_thesis
x-purpose: thesisbreaker.verify
x-granted-capabilities: read:submitted_decision,
    read:submitted_evidence,
    invoke:thesisbreaker.reasoning_pipeline,
    return:verification_result

{
  "thesis": "Adopting Rust for the ingestion service will halve p99 latency.",
  "domain": "technical",
  "evidence": [
    "Benchmarks show 60-90ms vs 180ms today.",
    "Team has zero Rust experience.",
    "No hires planned this quarter."
  ]
}`}
          </pre>
          <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
            <Chip icon={ShieldCheck} label="Deny by default" color="#22c55e" />
            <Chip icon={Zap} label="Sub-second" color="#f0b90b" />
            <Chip icon={Cpu} label="SharedOS turn" color="#9aa1ae" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function ServiceTile({
  name,
  price,
  description,
}: {
  name: string;
  price: number;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-[#1e222c] bg-[#0a0c11] p-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm font-semibold text-white">{name}</span>
        <span className="chip chip-brand">{price} credits</span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-[#9aa1ae]">{description}</p>
    </div>
  );
}

function Chip({
  icon: Icon,
  label,
  color,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  color: string;
}) {
  return (
    <div
      className="flex items-center justify-center gap-1 rounded-full border px-2 py-1 uppercase tracking-widest"
      style={{
        borderColor: `${color}55`,
        color,
        background: `${color}12`,
      }}
    >
      <Icon size={10} />
      {label}
    </div>
  );
}
