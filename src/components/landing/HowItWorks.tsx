"use client";

import { motion } from "framer-motion";
import { FileText, Swords, Rocket } from "lucide-react";

const STEPS = [
  {
    n: "01",
    title: "SUBMIT YOUR THESIS",
    body:
      "Describe what you believe about a Binance market in plain English. The agent extracts the assumptions, catalysts, timeframe, and invalidation conditions that must be true.",
    icon: FileText,
    accent: "#9aa1ae",
  },
  {
    n: "02",
    title: "BREAK THE THESIS",
    body:
      "The agent extracts assumptions, challenges them, analyzes live Binance market conditions, and searches for reasons the trade could fail.",
    icon: Swords,
    accent: "#f0b90b",
  },
  {
    n: "03",
    title: "REVIEW THE ACTION",
    body:
      "When the thesis survives and trade conditions are acceptable, review the proposed Binance Agent OS action before execution — you approve.",
    icon: Rocket,
    accent: "#22c55e",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="relative mx-auto max-w-7xl px-5 py-24 md:px-8">
      <div className="mb-14 max-w-3xl">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#5e6472]">
          The Loop
        </div>
        <h2 className="font-display text-4xl leading-[1.05] text-white md:text-5xl">
          How ThesisBreaker works.
        </h2>
        <p className="mt-3 max-w-xl text-[#9aa1ae]">
          Every idea passes through the same disciplined pipeline. If it survives — and market
          conditions agree — it moves to a reviewed Binance Agent OS action.
        </p>
      </div>

      <div className="relative grid gap-6 md:grid-cols-3">
        {/* Connecting line */}
        <div className="pointer-events-none absolute left-6 right-6 top-16 hidden h-px bg-gradient-to-r from-transparent via-[#2a2f3c] to-transparent md:block" />
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div
              key={s.n}
              className="surface surface-hover relative p-6"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-10% 0px" }}
              transition={{ duration: 0.6, delay: i * 0.15, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold tracking-[0.2em] text-[#5e6472]">
                  {s.n}
                </span>
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#1e222c] bg-[#0b0d12]"
                  style={{ color: s.accent }}
                >
                  <Icon size={16} />
                </div>
              </div>
              <div className="mt-6 text-sm font-semibold tracking-[0.16em] text-white">
                {s.title}
              </div>
              <p className="mt-3 text-[15px] leading-relaxed text-[#9aa1ae]">{s.body}</p>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
