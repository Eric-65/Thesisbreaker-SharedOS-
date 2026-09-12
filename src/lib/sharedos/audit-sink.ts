/**
 * Durable + inspectable audit sink.
 *
 * Every event recorded here is produced by the SharedOS kernel itself — this
 * module never synthesizes an event, and never claims an authorization
 * decision the kernel did not make. It only persists and exposes what the
 * kernel emitted, so `docs/arena-runbook.md` can verify that a real Arena
 * request generated real SharedOS turns.
 */

import type { AuditEvent, AuditSink } from "@aicoo/sharedos-core";

const RING_SIZE = 500;

/** In-process ring buffer. Always available, survives a missing database. */
export class MemoryAuditSink implements AuditSink {
  readonly #events: AuditEvent[] = [];

  async record(event: AuditEvent): Promise<void> {
    this.#events.push(event);
    if (this.#events.length > RING_SIZE) this.#events.shift();
  }

  recent(limit = 50): readonly AuditEvent[] {
    return this.#events.slice(-limit).reverse();
  }

  byTrace(traceId: string): readonly AuditEvent[] {
    return this.#events.filter((e) => e.traceId === traceId);
  }

  count(): number {
    return this.#events.length;
  }

  clear(): void {
    this.#events.length = 0;
  }
}

/** Structured NDJSON to stderr — the Arena operator's live view. */
export class StructuredLogAuditSink implements AuditSink {
  readonly #enabled: boolean;

  constructor(enabled = process.env.SHAREDOS_AUDIT_STDERR !== "false") {
    this.#enabled = enabled;
  }

  async record(event: AuditEvent): Promise<void> {
    if (!this.#enabled) return;
    process.stderr.write(
      `${JSON.stringify({
        log: "sharedos.audit",
        type: event.type,
        outcome: event.outcome,
        purpose: event.purpose,
        tool: event.tool,
        action: event.action,
        reason: event.reason,
        traceId: event.traceId,
        at: event.at,
      })}\n`,
    );
  }
}

/**
 * Persists kernel audit events to Postgres when a database is configured.
 * A missing or failing database degrades to a warning — audit storage is
 * diagnostic and must never take the Arena service down mid-round.
 */
export class DatabaseAuditSink implements AuditSink {
  async record(event: AuditEvent): Promise<void> {
    try {
      const { getDb } = await import("../../db");
      const database = getDb();
      if (!database) return;
      const { auditEvents } = await import("../../db/schema");
      await database.insert(auditEvents).values({
        eventId: event.id,
        type: event.type,
        outcome: event.outcome,
        occurredAt: new Date(event.at),
        traceId: event.traceId,
        namespaceId: event.namespaceId,
        purpose: event.purpose,
        actor: event.actor as unknown as object,
        authority: event.authority as unknown as object,
        owner: event.owner as unknown as object,
        resource: (event.resource ?? null) as unknown as object | null,
        action: event.action ?? null,
        tool: event.tool ?? null,
        grantId: event.grantId ?? null,
        reason: event.reason ?? null,
        metadata: (event.metadata ?? null) as unknown as object | null,
      });
    } catch (err) {
      console.warn("[sharedos] audit persistence unavailable:", (err as Error).message);
    }
  }
}

/** The process-wide memory sink, exported so diagnostics can read it. */
export const memoryAudit = new MemoryAuditSink();
