import Link from "next/link";
import { BackgroundFx } from "@/components/BackgroundFx";
import { SiteHeader } from "@/components/SiteHeader";
import { TickerMarquee } from "@/components/TickerMarquee";
import { Hero } from "@/components/landing/Hero";
import { MiniDemo } from "@/components/landing/MiniDemo";
import { ForAgents } from "@/components/landing/ForAgents";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { ProveMeWrong } from "@/components/landing/ProveMeWrong";
import { ScoreSection } from "@/components/landing/ScoreSection";
import { PaperFlow } from "@/components/landing/PaperFlow";
import { Monitoring } from "@/components/landing/Monitoring";
import { FinalCTA } from "@/components/landing/FinalCTA";

export default function LandingPage() {
  return (
    <>
      <BackgroundFx />
      <SiteHeader />
      <TickerMarquee />
      <Hero />
      <ForAgents />
      <MiniDemo />
      <HowItWorks />
      <ProveMeWrong />
      <ScoreSection />
      <PaperFlow />
      <Monitoring />
      <FinalCTA />
      <footer className="border-t border-[#12141b]">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-10 md:px-8">
          <div className="grid gap-6 md:grid-cols-[1.4fr_1fr] md:items-end">
            <div>
              <div className="font-display text-xl text-white">ThesisBreaker</div>
              <div className="mt-1 text-sm text-[#9aa1ae]">
                Break a decision before an agent acts on it. Decision-verification service
                for autonomous agents on SharedOS.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-[#5e6472] md:justify-end">
              <Link href="/agent" className="hover:text-white">
                Agent Services
              </Link>
              <Link href="/new" className="hover:text-white">
                Break Thesis (human)
              </Link>
              <Link href="/dashboard" className="hover:text-white">
                Dashboard
              </Link>
              <Link href="/settings" className="hover:text-white">
                Settings
              </Link>
            </div>
          </div>
          <hr className="hr-dim" />
          <div className="flex flex-col gap-3 text-[11px] leading-relaxed text-[#5e6472] md:flex-row md:items-center md:justify-between">
            <div className="max-w-3xl">
              ThesisBreaker is a research and decision-verification service for autonomous
              agents. AI outputs may be incorrect. Users are responsible for reviewing every
              proposed action and its risks before acting. Not investment advice. Trading
              functionality (Binance Agent OS integration) is a legacy application of the
              engine — the Arena-facing product runs entirely without Binance credentials.
              Independent product — not affiliated with, endorsed by, or sponsored by
              Binance or SharedOS.
            </div>
            <div className="flex items-center gap-2">
              <span className="chip chip-brand">SharedOS Arena Build</span>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
