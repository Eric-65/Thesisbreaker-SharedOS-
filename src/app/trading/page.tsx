import { AppShell } from "@/components/AppShell";
import { BackgroundFx } from "@/components/BackgroundFx";
import { PositionsClient } from "@/components/trading/PositionsClient";

export default function PositionsPage() {
  return (
    <>
      <BackgroundFx />
      <AppShell>
        <div className="mx-auto max-w-7xl px-5 py-8 md:px-8">
          <div className="mb-8">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#5e6472]">
              Agent Account
            </div>
            <h1 className="font-display text-4xl leading-tight text-white md:text-5xl">
              Positions
            </h1>
            <p className="mt-2 text-[#9aa1ae]">
              Agent-managed positions inside your Binance Agent OS sub-account.
              Balances and P/L are shown only when Agent OS is connected — no
              fake account data.
            </p>
          </div>
          <PositionsClient />
        </div>
      </AppShell>
    </>
  );
}
