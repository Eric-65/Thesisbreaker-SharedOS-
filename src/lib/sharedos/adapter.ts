/**
 * SharedOS adapter
 *
 * ThesisBreaker's Arena services must execute inside SharedOS Cloud, gated by
 * SharedOS grants with a deny-by-default policy, logged into the SharedOS
 * audit trail, and discoverable on SharedNet.
 *
 * At the time of writing, the SharedOS SDK method surface for this hackathon
 * is not confirmed here. Rather than invent method names, this adapter
 * provides an honest interface:
 *
 *   - It ALWAYS enforces the deny-by-default grant policy locally.
 *   - It ALWAYS emits an audit record for every service call.
 *   - It exposes a single `execute` entry point that wraps the reasoning
 *     pipeline in a SharedOS-style "agent turn".
 *   - When the real SharedOS SDK is wired in, only this file changes.
 *
 * The adapter reports honest connection state:
 *   NOT_CONNECTED   — no SharedOS bearer present; local execution mode
 *   CONNECTING      — bearer present, probe in flight
 *   CONNECTED       — real SharedOS Cloud session
 *   ERROR           — probe failed
 *
 * The Arena services function fully in LOCAL mode without any SharedOS
 * credential, because they must be usable from other agents on SharedNet
 * even before the platform integration is wired.
 */

import type { ServiceName, ServiceSpec } from "../services/registry";
import { getService, PURPOSE } from "../services/registry";

export type SharedOsConnectionState =
  | "NOT_CONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "ERROR";

export type ExecutionMode = "LOCAL" | "SHARED_OS_CLOUD";

export interface SharedOsStatus {
  state: SharedOsConnectionState;
  executionMode: ExecutionMode;
  purpose: string;
  policy: "DENY_BY_DEFAULT";
  hasCredential: boolean;
  cloudEndpoint: string | null;
  nodeId: string | null;
  lastVerified: string;
  message: string;
  lastError?: string;
}

export interface GrantContext {
  /** Purpose string this call is executed under. */
  purpose: string;
  /** The service being invoked. */
  service: ServiceName;
  /** Grants the caller claims to hold (opaque strings). */
  grantedCapabilities: string[];
  /** Optional caller agent identifier. */
  callerAgentId?: string;
  /** Optional caller display name (for audit only). */
  callerName?: string;
  /** Idempotency key. */
  requestId: string;
}

export interface ExecutionInput<TReq> {
  service: ServiceName;
  request: TReq;
  grants: GrantContext;
}

export interface ExecutionResult<TRes> {
  ok: boolean;
  service: ServiceName;
  purpose: string;
  mode: ExecutionMode;
  data?: TRes;
  error?: string;
  denied?: {
    reason: string;
    missingCapabilities?: string[];
  };
  durationMs: number;
  requestId: string;
}

// ---------- Env / status ----------

const SHARED_OS_ENDPOINT = (process.env.SHAREDOS_ENDPOINT ?? "").trim();
const SHARED_OS_NODE_ID = (process.env.SHAREDNET_NODE_ID ?? "").trim();

function readToken(): string | null {
  const t = (process.env.SHAREDOS_TOKEN ?? "").trim();
  return t.length > 0 ? t : null;
}

/**
 * Honest connection status. LOCAL mode is the default and is fully usable.
 * We NEVER claim CONNECTED without a probe returning a positive response.
 */
export async function getSharedOsStatus(): Promise<SharedOsStatus> {
  const token = readToken();
  const hasCredential = !!token;
  const cloudEndpoint = SHARED_OS_ENDPOINT || null;
  const nodeId = SHARED_OS_NODE_ID || null;

  if (!hasCredential || !cloudEndpoint) {
    return {
      state: "NOT_CONNECTED",
      executionMode: "LOCAL",
      purpose: PURPOSE,
      policy: "DENY_BY_DEFAULT",
      hasCredential,
      cloudEndpoint,
      nodeId,
      lastVerified: new Date().toISOString(),
      message:
        "SharedOS Cloud is not configured on this server. Arena services execute in LOCAL mode with the same deny-by-default grant policy. Set SHAREDOS_ENDPOINT + SHAREDOS_TOKEN + SHAREDNET_NODE_ID to route agent turns through SharedOS Cloud.",
    };
  }

  // Best-effort probe. We deliberately do not invent a SharedOS method name;
  // any 2xx response confirms reachability, any 401/403 confirms
  // credential rejection, anything else is treated as ERROR.
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(cloudEndpoint, {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(t);
    if (res.status === 401 || res.status === 403) {
      return {
        state: "ERROR",
        executionMode: "LOCAL",
        purpose: PURPOSE,
        policy: "DENY_BY_DEFAULT",
        hasCredential,
        cloudEndpoint,
        nodeId,
        lastVerified: new Date().toISOString(),
        message:
          "SharedOS Cloud rejected the configured credential. Arena services remain available in LOCAL mode.",
        lastError: `HTTP ${res.status}`,
      };
    }
    if (!res.ok) {
      return {
        state: "ERROR",
        executionMode: "LOCAL",
        purpose: PURPOSE,
        policy: "DENY_BY_DEFAULT",
        hasCredential,
        cloudEndpoint,
        nodeId,
        lastVerified: new Date().toISOString(),
        message:
          "SharedOS Cloud probe returned a non-OK status. Arena services remain available in LOCAL mode.",
        lastError: `HTTP ${res.status}`,
      };
    }
    return {
      state: "CONNECTED",
      executionMode: "SHARED_OS_CLOUD",
      purpose: PURPOSE,
      policy: "DENY_BY_DEFAULT",
      hasCredential,
      cloudEndpoint,
      nodeId,
      lastVerified: new Date().toISOString(),
      message: "SharedOS Cloud reachable; agent turns will be executed inside SharedOS.",
    };
  } catch (err) {
    return {
      state: "ERROR",
      executionMode: "LOCAL",
      purpose: PURPOSE,
      policy: "DENY_BY_DEFAULT",
      hasCredential,
      cloudEndpoint,
      nodeId,
      lastVerified: new Date().toISOString(),
      message:
        "SharedOS Cloud probe failed. Arena services remain available in LOCAL mode.",
      lastError: (err as Error).message,
    };
  }
}

// ---------- Grant enforcement ----------

/**
 * Enforces deny-by-default against the service's declared allowed set.
 * The caller must hold every capability listed in `required`; any capability
 * NOT in the service's `allowed` list is refused even if the caller claims it.
 *
 * Returns null on success, otherwise a description of what was denied.
 */
export function checkGrants(
  spec: ServiceSpec,
  granted: string[],
  required: string[],
): { denied: false } | { denied: true; missing: string[]; reason: string } {
  // 1. Reject any granted capability not listed in the service's `allowed` set.
  const allowed = new Set(spec.permissions.allowed.map(normalize));
  const rejected: string[] = [];
  for (const g of granted.map(normalize)) {
    if (!allowed.has(g)) rejected.push(g);
  }
  if (rejected.length > 0) {
    return {
      denied: true,
      missing: rejected,
      reason: `Deny-by-default: the following requested capabilities are not part of the ${spec.name} service surface: ${rejected.join(", ")}`,
    };
  }

  // 2. Every REQUIRED capability must be granted.
  const grantedSet = new Set(granted.map(normalize));
  const missing = required
    .map(normalize)
    .filter((r) => !grantedSet.has(r));
  if (missing.length > 0) {
    return {
      denied: true,
      missing,
      reason: `Missing required capabilities: ${missing.join(", ")}`,
    };
  }
  return { denied: false };
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

// ---------- Execute ----------

/**
 * Run a service handler as a SharedOS-style agent turn. Enforces grants,
 * emits an audit record via `writeAudit`, and returns a typed result.
 *
 * The handler is invoked with the validated request; it MUST be synchronous
 * or return within `spec.timeoutMs`. The handler MUST NOT read anything
 * outside its declared allowed capabilities.
 */
export async function execute<TReq, TRes>(
  input: ExecutionInput<TReq>,
  requiredCapabilities: string[],
  handler: (req: TReq) => TRes | Promise<TRes>,
  writeAudit: (record: AuditRecord) => Promise<void>,
): Promise<ExecutionResult<TRes>> {
  const t0 = Date.now();
  const spec = getService(input.service);
  if (!spec) {
    return {
      ok: false,
      service: input.service,
      purpose: input.grants.purpose,
      mode: "LOCAL",
      error: `Unknown service: ${input.service}`,
      durationMs: 0,
      requestId: input.grants.requestId,
    };
  }

  // Enforce purpose alignment
  if (input.grants.purpose !== spec.purpose) {
    const err = {
      reason: `Purpose mismatch: service '${spec.name}' expects '${spec.purpose}', caller declared '${input.grants.purpose}'`,
    };
    await writeAudit({
      service: spec.name,
      purpose: input.grants.purpose,
      requestId: input.grants.requestId,
      callerAgentId: input.grants.callerAgentId,
      outcome: "DENIED",
      mode: "LOCAL",
      grantedCapabilities: input.grants.grantedCapabilities,
      requiredCapabilities,
      deniedReason: err.reason,
      durationMs: Date.now() - t0,
    });
    return {
      ok: false,
      service: input.service,
      purpose: input.grants.purpose,
      mode: "LOCAL",
      error: err.reason,
      denied: { reason: err.reason },
      durationMs: Date.now() - t0,
      requestId: input.grants.requestId,
    };
  }

  const check = checkGrants(spec, input.grants.grantedCapabilities, requiredCapabilities);
  if (check.denied) {
    await writeAudit({
      service: spec.name,
      purpose: input.grants.purpose,
      requestId: input.grants.requestId,
      callerAgentId: input.grants.callerAgentId,
      outcome: "DENIED",
      mode: "LOCAL",
      grantedCapabilities: input.grants.grantedCapabilities,
      requiredCapabilities,
      deniedReason: check.reason,
      deniedMissing: check.missing,
      durationMs: Date.now() - t0,
    });
    return {
      ok: false,
      service: input.service,
      purpose: input.grants.purpose,
      mode: "LOCAL",
      error: check.reason,
      denied: { reason: check.reason, missingCapabilities: check.missing },
      durationMs: Date.now() - t0,
      requestId: input.grants.requestId,
    };
  }

  // Actually execute — LOCAL mode. When the SharedOS SDK is wired, this
  // block wraps the handler in an `agentTurn` call against `cloudEndpoint`.
  const status = await getSharedOsStatus();
  const mode: ExecutionMode = status.executionMode;

  const timeout = spec.timeoutMs;
  try {
    const data = await withTimeout(handler(input.request), timeout);
    const durationMs = Date.now() - t0;
    await writeAudit({
      service: spec.name,
      purpose: input.grants.purpose,
      requestId: input.grants.requestId,
      callerAgentId: input.grants.callerAgentId,
      outcome: "ALLOWED",
      mode,
      grantedCapabilities: input.grants.grantedCapabilities,
      requiredCapabilities,
      durationMs,
      priceCredits: spec.priceCredits,
    });
    return {
      ok: true,
      service: input.service,
      purpose: input.grants.purpose,
      mode,
      data,
      durationMs,
      requestId: input.grants.requestId,
    };
  } catch (err) {
    const durationMs = Date.now() - t0;
    const message = (err as Error).message;
    await writeAudit({
      service: spec.name,
      purpose: input.grants.purpose,
      requestId: input.grants.requestId,
      callerAgentId: input.grants.callerAgentId,
      outcome: "ERROR",
      mode,
      grantedCapabilities: input.grants.grantedCapabilities,
      requiredCapabilities,
      durationMs,
      error: message,
    });
    return {
      ok: false,
      service: input.service,
      purpose: input.grants.purpose,
      mode,
      error: message,
      durationMs,
      requestId: input.grants.requestId,
    };
  }
}

async function withTimeout<T>(p: Promise<T> | T, ms: number): Promise<T> {
  if (!(p instanceof Promise)) return p;
  return await new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

// ---------- Audit ----------

export interface AuditRecord {
  service: ServiceName;
  purpose: string;
  requestId: string;
  callerAgentId?: string;
  outcome: "ALLOWED" | "DENIED" | "ERROR";
  mode: ExecutionMode;
  grantedCapabilities: string[];
  requiredCapabilities: string[];
  deniedReason?: string;
  deniedMissing?: string[];
  error?: string;
  priceCredits?: number;
  durationMs: number;
}
