import { AppShell } from "@/components/AppShell";
import { BackgroundFx } from "@/components/BackgroundFx";
import { SettingsClient } from "@/components/settings/SettingsClient";
import { getAgentConnectionStatusSync } from "@/lib/binance/agent";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const initial = getAgentConnectionStatusSync();
  return (
    <>
      <BackgroundFx />
      <AppShell>
        <div className="mx-auto max-w-4xl px-5 py-8 md:px-8">
          <div className="mb-8">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#5e6472]">
              Connection
            </div>
            <h1 className="font-display text-4xl leading-tight text-white md:text-5xl">
              Settings
            </h1>
          </div>
          <SettingsClient initial={initial} />
        </div>
      </AppShell>
    </>
  );
}
