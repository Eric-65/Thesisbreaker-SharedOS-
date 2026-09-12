/**
 * Arena configuration — the single source of truth for the purpose string,
 * service pricing and SharedOS/SharedNet identity.
 *
 * Everything here is environment-driven. No real credential is ever committed,
 * and nothing here is exposed through a NEXT_PUBLIC_* variable.
 */

export type ServiceName = "free_preview" | "verify_claim" | "break_thesis";

export const SERVICE_NAMES: readonly ServiceName[] = [
  "free_preview",
  "verify_claim",
  "break_thesis",
] as const;

function env(name: string): string | null {
  const v = (process.env[name] ?? "").trim();
  return v.length > 0 ? v : null;
}

function intEnv(name: string, fallback: number): number {
  const raw = env(name);
  if (raw === null) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * The SharedOS purpose string. One consistent value across every Arena-facing
 * execution path, attached to every kernel turn and every audit event.
 */
export const PURPOSE = env("SHAREDOS_PURPOSE") ?? "thesisbreaker.verify";

/** SharedOS resource + tool namespace owned by this product. */
export const NAMESPACE = env("SHAREDOS_NAMESPACE") ?? "thesisbreaker";

/** Price list, in Arena credits. Configuration-based so it is easy to adjust. */
export const PRICES: Record<ServiceName, number> = {
  free_preview: intEnv("PRICE_FREE_PREVIEW", 0),
  verify_claim: intEnv("PRICE_VERIFY_CLAIM", 5),
  break_thesis: intEnv("PRICE_BREAK_THESIS", 10),
};

export const CURRENCY = "Arena credits";

/**
 * Identity supplied by the hackathon organizers / SharedNet registration.
 * All optional: the product runs and serves agents before registration
 * completes, and reports itself honestly as unregistered until then.
 */
export const IDENTITY = {
  tenantId: env("SHAREDOS_TENANT_ID"),
  ownerAddress: env("SHAREDOS_OWNER_ADDRESS"),
  productAgentAddress: env("SHAREDOS_AGENT_ADDRESS"),
  sharednetNodeId: env("SHAREDNET_NODE_ID"),
  sharednetRoomId: env("SHAREDNET_ROOM_ID"),
} as const;

/** Bounded research budget. Zero disables outbound research entirely. */
export const RESEARCH = {
  enabled: env("THESISBREAKER_RESEARCH_ENABLED") === "true",
  maxFetches: intEnv("THESISBREAKER_RESEARCH_MAX_FETCHES", 0),
  timeoutMs: intEnv("THESISBREAKER_RESEARCH_TIMEOUT_MS", 3_000),
} as const;

/** Per-service execution timeouts. Arena requires well under five minutes. */
export const TIMEOUTS: Record<ServiceName, number> = {
  free_preview: intEnv("TIMEOUT_FREE_PREVIEW_MS", 10_000),
  verify_claim: intEnv("TIMEOUT_VERIFY_CLAIM_MS", 20_000),
  break_thesis: intEnv("TIMEOUT_BREAK_THESIS_MS", 45_000),
};

/** Hard ceiling the Arena imposes on any single service call. */
export const ARENA_MAX_LATENCY_MS = 5 * 60 * 1000;

export function priceOf(service: ServiceName): number {
  return PRICES[service];
}

export function isPaid(service: ServiceName): boolean {
  return PRICES[service] > 0;
}

/** True once enough identity is present to act as a registered Arena product. */
export function isRegistered(): boolean {
  return IDENTITY.productAgentAddress !== null && IDENTITY.sharednetNodeId !== null;
}
