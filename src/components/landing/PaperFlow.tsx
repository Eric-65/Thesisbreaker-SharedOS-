"use client";

import { motion } from "framer-motion";
import { FileText, Gavel, ShieldCheck, LineChart, Activity, ArrowRight } from "lucide-react";

const NODES = [
  { icon: FileText, label: "Thesis", sub: "Your idea", color: "#e7e9ee" },
  { icon: Gavel, label: "Red-Team Verdict", sub: "Thesis score", color: "#ef4444" },
  { icon: LineChart, label: "Trade Readiness", sub: "Live Binance conditions", color: "#f0b90b" },
  { icon: ShieldCheck, label: "Risk Gate", sub: "Deterministic checks", color: "#22c55e" },
  { icon: Activity, label: "Review & Approve", sub: "Binance Agent OS action", color: "#f0b90b" },
];

export function PaperFlow() {
  return (
    <section className="relative mx-auto max-w-7xl px-5 py-24 md:px-8">
      <div className="mb-14 max-w-3xl">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#5e6472]">
          From thesis to action
        </div>
        <h2 className="font-display text-4xl leading-[1.05] text-white md:text-5xl">
          Only <span className="text-[#f0b90b]">surviving ideas</span> reach Binance.
        </h2>
        <p className="mt-3 max-w-xl text-[#9aa1ae]">
          The pipeline enforces discipline. Every step is explicit, auditable, and reversible —
          and no order is submitted without your review.
        </p>
      </div>

      <div className="surface p-6 md:p-10">
        <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center md:justify-between">
          {NODES.map((n, i) => {
            const Icon = n.icon;
            return (
              <motion.div
                key={n.label}
                className="relative flex items-center gap-3 md:flex-col md:items-center md:gap-2 md:text-center"
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.12 }}
              >
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-xl border border-[#1e222c] bg-[#0a0c11]"
                  style={{ color: n.color }}
                >
                  <Icon size={18} />
                </div>
                <div className="md:mt-1">
                  <div className="text-sm font-semibold text-white">{n.label}</div>
                  <div className="text-xs text-[#5e6472]">{n.sub}</div>
                </div>
                {i < NODES.length - 1 && (
                  <ArrowRight
                    size={14}
                    className="ml-auto text-[#3b4252] md:absolute md:right-[-14px] md:top-6 md:ml-0"
                  />
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
