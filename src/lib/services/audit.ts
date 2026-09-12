import { db } from "@/db";
import { serviceCalls } from "@/db/schema";
import type { AuditRecord } from "../sharedos/adapter";

/**
 * Persist an audit record for a service invocation. Always safe to call —
 * never throws (audit failure never blocks the service call).
 */
export async function writeAudit(
  record: AuditRecord,
  extras: { request: unknown; response?: unknown; callerName?: string } = { request: {} },
): Promise<void> {
  try {
    await db.insert(serviceCalls).values({
      service: record.service,
      purpose: record.purpose,
      callerAgentId: record.callerAgentId ?? null,
      callerName: extras.callerName ?? null,
      requestId: record.requestId,
      request: extras.request as object,
      response: (extras.response ?? null) as object | null,
      outcome: record.outcome,
      mode: record.mode,
      grantedCapabilities: record.grantedCapabilities as unknown as object,
      requiredCapabilities: record.requiredCapabilities as unknown as object,
      deniedReason: record.deniedReason ?? null,
      deniedMissing: (record.deniedMissing ?? null) as unknown as object | null,
      errorMessage: record.error ?? null,
      priceCredits: record.priceCredits ?? null,
      durationMs: record.durationMs,
    });
  } catch (err) {
    // Audit failure never propagates — it's diagnostic, not the source of truth.
    // eslint-disable-next-line no-console
    console.warn("audit write failed", (err as Error).message);
  }
}
