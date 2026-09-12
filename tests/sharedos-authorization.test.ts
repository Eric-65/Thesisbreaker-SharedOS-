/**
 * Proves that SharedOS is genuinely the execution layer:
 *   - an allowed request succeeds and produces kernel audit events
 *   - an unauthorized request is DENIED as a controlled result, not a crash
 *   - the denial is visible in the audit trail
 *
 * Nothing here stubs the kernel. These assertions are made against the real
 * `@aicoo/sharedos-core` authorization path.
 */

import { describe, expect, it } from "vitest";

import { PURPOSE } from "@/lib/arena/config";
import { MemoryAuditSink } from "@/lib/sharedos/audit-sink";
import { ThesisBreakerHost } from "@/lib/sharedos/kernel";
import { FreeTierOnlyEntitlementStore, NoEntitlementStore } from "@/lib/sharedos/grants";

function host(options: ConstructorParameters<typeof ThesisBreakerHost>[0] = {}) {
  const audit = new MemoryAuditSink();
  return { host: new ThesisBreakerHost({ ...options, auditSinks: [audit] }), audit };
}

const caller = { agentId: "agent_customer_1", name: "Customer Agent" };

describe("SharedOS authorization", () => {
  it("allows an entitled caller and returns a structured result", async () => {
    const { host: h, audit } = host();

    const outcome = await h.runServiceTurn("break_thesis", {
      thesis: "We should migrate the billing service to event sourcing this quarter.",
      objective: "Reduce reconciliation incidents",
    }, caller);

    expect(outcome.ok).toBe(true);
    expect(outcome.denied).toBeUndefined();
    expect(outcome.purpose).toBe(PURPOSE);

    const data = outcome.data as Record<string, unknown>;
    expect(data.service).toBe("break_thesis");
    expect(typeof data.verdict).toBe("string");
    expect(typeof data.score).toBe("number");

    // The kernel — not this test — emitted these.
    const events = audit.recent(100);
    expect(events.some((e) => e.type === "tool.invoked" && e.outcome === "succeeded")).toBe(true);
    expect(events.some((e) => e.type === "authorization.checked")).toBe(true);
    expect(events.every((e) => e.purpose === PURPOSE)).toBe(true);
  });

  it("DENIES a paid service when the caller holds only the free tier", async () => {
    const { host: h, audit } = host({ entitlements: new FreeTierOnlyEntitlementStore() });

    const denied = await h.runServiceTurn("break_thesis", { thesis: "Ship it on Friday." }, caller);

    expect(denied.ok).toBe(false);
    expect(denied.denied).toBeDefined();
    expect(denied.error?.code).toBe("unauthorized");

    // Still a controlled result — the service did not throw.
    expect(denied.requestId).toBeTruthy();

    const events = audit.recent(100);
    expect(events.some((e) => e.outcome === "denied")).toBe(true);
  });

  it("still allows the free tier for the same restricted caller", async () => {
    const { host: h } = host({ entitlements: new FreeTierOnlyEntitlementStore() });

    const allowed = await h.runServiceTurn("free_preview", { thesis: "Ship it on Friday." }, caller);

    expect(allowed.ok).toBe(true);
    expect((allowed.data as Record<string, unknown>).service).toBe("free_preview");
  });

  it("fails closed when no authority can be established", async () => {
    const { host: h } = host({ entitlements: new NoEntitlementStore() });

    for (const service of ["free_preview", "verify_claim", "break_thesis"] as const) {
      const outcome = await h.runServiceTurn(service, { thesis: "x".repeat(50), claim: "x".repeat(50) }, caller);
      expect(outcome.ok).toBe(false);
      expect(outcome.error).toBeDefined();
    }
  });

  it("permission-filters the tool catalogue per caller", async () => {
    const full = host();
    const limited = host({ entitlements: new FreeTierOnlyEntitlementStore() });

    const allTools = await full.host.listToolsFor(caller);
    const freeTools = await limited.host.listToolsFor(caller);

    expect(allTools.map((t) => t.name).sort()).toEqual([
      "thesisbreaker.break_thesis",
      "thesisbreaker.free_preview",
      "thesisbreaker.verify_claim",
    ]);
    expect(freeTools.map((t) => t.name)).toEqual(["thesisbreaker.free_preview"]);
  });
});
