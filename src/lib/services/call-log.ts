/**
 * Service usage log — billing and operations, NOT the SharedOS audit trail.
 *
 * The authoritative authorization record is the SharedOS kernel's own audit
 * stream (see `src/lib/sharedos/audit-sink.ts`). This table exists so the
 * operator can answer commercial questions — who called what, how long it took,
 * how many credits are outstanding — without re-reading the kernel trail.
 *
 * Never treat a row here as proof that SharedOS authorized anything.
 */

import type { ServiceName } from "../arena/config";
import type { Caller } from "../sharedos/kernel";

export interface ServiceCallRecord {
  service: ServiceName;
  requestId: string;
  caller: Caller;
  ok: boolean;
  durationMs: number;
  priceCredits: number;
  deniedReason?: string;
  errorCode?: string;
}

const recent: ServiceCallRecord[] = [];
const MAX_RECENT = 200;

/** Never throws — usage logging must not take the Arena service down. */
export async function recordServiceCall(record: ServiceCallRecord): Promise<void> {
  recent.push(record);
  if (recent.length > MAX_RECENT) recent.shift();

  try {
    const { getDb } = await import("../../db");
    const database = getDb();
    if (!database) return;
    const { serviceCalls } = await import("../../db/schema");
    await database.insert(serviceCalls).values({
      service: record.service,
      purpose: (await import("../arena/config")).PURPOSE,
      callerAgentId: record.caller.agentId,
      callerName: record.caller.name ?? null,
      requestId: record.requestId,
      request: {},
      response: null,
      outcome: record.ok ? "ALLOWED" : record.deniedReason ? "DENIED" : "ERROR",
      mode: "SHARED_OS",
      grantedCapabilities: [] as unknown as object,
      requiredCapabilities: [] as unknown as object,
      deniedReason: record.deniedReason ?? null,
      deniedMissing: null,
      errorMessage: record.errorCode ?? null,
      priceCredits: record.priceCredits,
      durationMs: record.durationMs,
    });
  } catch (err) {
    console.warn("[thesisbreaker] usage log unavailable:", (err as Error).message);
  }
}

export function recentServiceCalls(limit = 50): ServiceCallRecord[] {
  return recent.slice(-limit).reverse();
}

/** Credits earned but not yet confirmed as received. */
export function outstandingCredits(): number {
  return recent.filter((r) => r.ok && r.priceCredits > 0).reduce((sum, r) => sum + r.priceCredits, 0);
}
