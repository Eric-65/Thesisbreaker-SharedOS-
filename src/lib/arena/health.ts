/**
 * Arena readiness.
 *
 * Reports what is actually true. If SharedOS cannot execute a turn, the status
 * is `degraded` — never `ready` — and no credential value is ever included in
 * the response.
 */

import { PRICES, SERVICE_NAMES, type ServiceName } from "./config";
import { invokeService } from "../services/invoke";
import { getSharedOsStatus } from "../sharedos/adapter";

export type Readiness = "ready" | "degraded" | "down";

export interface ServiceHealth {
  status: "ready" | "failing";
  price_credits: number;
  last_check_ms?: number;
  error?: string;
}

export interface ArenaHealth {
  status: Readiness;
  sharedos: "active" | "error";
  registration: "registered" | "unregistered";
  purpose: string;
  services: Record<ServiceName, ServiceHealth>;
  checks: { name: string; ok: boolean; detail?: string }[];
  checked_at: string;
}

/** Smoke inputs that exercise each service without external dependencies. */
const PROBES: Record<ServiceName, unknown> = {
  free_preview: { thesis: "Readiness probe: this product is ready to serve Arena traffic." },
  verify_claim: { claim: "Readiness probe claim for the Arena health check." },
  break_thesis: { thesis: "Readiness probe: this product is ready to serve Arena traffic." },
};

export async function checkArenaHealth(): Promise<ArenaHealth> {
  const status = await getSharedOsStatus();

  const services = {} as Record<ServiceName, ServiceHealth>;
  for (const service of SERVICE_NAMES) {
    const started = Date.now();
    try {
      const envelope = await invokeService(service, PROBES[service], {
        caller: { agentId: "thesisbreaker.healthcheck", name: "health check" },
        log: false,
      });
      services[service] = envelope.success
        ? { status: "ready", price_credits: PRICES[service], last_check_ms: Date.now() - started }
        : {
            status: "failing",
            price_credits: PRICES[service],
            last_check_ms: Date.now() - started,
            error: envelope.error.code,
          };
    } catch (err) {
      services[service] = {
        status: "failing",
        price_credits: PRICES[service],
        error: (err as Error).message,
      };
    }
  }

  const allServicesReady = SERVICE_NAMES.every((s) => services[s].status === "ready");
  const kernelActive = status.kernel.state === "ACTIVE";

  const checks = [
    { name: "sharedos_kernel_active", ok: kernelActive, detail: status.kernel.lastError },
    {
      name: "tools_registered",
      ok: status.kernel.registeredTools.length === SERVICE_NAMES.length,
      detail: `${status.kernel.registeredTools.length}/${SERVICE_NAMES.length}`,
    },
    { name: "services_executable", ok: allServicesReady },
    {
      name: "sharednet_registered",
      ok: status.registration.state === "REGISTERED",
      detail:
        status.registration.missing.length > 0
          ? `missing: ${status.registration.missing.join(", ")}`
          : undefined,
    },
    { name: "deny_by_default", ok: status.kernel.policy === "DENY_BY_DEFAULT" },
  ].map((c) => ({ name: c.name, ok: c.ok, ...(c.detail ? { detail: c.detail } : {}) }));

  // Registration is required to TRADE in the Arena, but not to execute. A
  // product that can execute but is not yet registered is degraded, not down.
  const status_: Readiness = !kernelActive || !allServicesReady
    ? "down"
    : status.registration.state === "REGISTERED"
      ? "ready"
      : "degraded";

  return {
    status: status_,
    sharedos: kernelActive ? "active" : "error",
    registration: status.registration.state === "REGISTERED" ? "registered" : "unregistered",
    purpose: status.purpose,
    services,
    checks,
    checked_at: new Date().toISOString(),
  };
}
