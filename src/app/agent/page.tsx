import { AppShell } from "@/components/AppShell";
import { BackgroundFx } from "@/components/BackgroundFx";
import { AgentServicesClient } from "@/components/agent/AgentServicesClient";

export const dynamic = "force-dynamic";

export default function AgentServicesPage() {
  return (
    <>
      <BackgroundFx />
      <AppShell>
        <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
          <div className="mb-6">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#f0b90b]">
              Agent Services · SharedOS Arena
            </div>
            <h1 className="font-display text-4xl leading-tight text-white md:text-5xl">
              ThesisBreaker Agent Services
            </h1>
            <p className="mt-2 max-w-2xl text-[#9aa1ae]">
              ThesisBreaker exposes two agent-callable services on SharedNet: a full{" "}
              <span className="font-mono text-white">break_thesis</span> stress-test and a fast{" "}
              <span className="font-mono text-white">verify_claim</span> check. Every call
              executes as a SharedOS-style agent turn under a single purpose string and a
              deny-by-default grant policy, and is written to the audit trail.
            </p>
          </div>
          <AgentServicesClient />
        </div>
      </AppShell>
    </>
  );
}
