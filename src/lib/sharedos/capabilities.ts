/**
 * ThesisBreaker's capability model, expressed in real SharedOS contracts.
 *
 * The kernel is deny-by-default: a tool call is refused unless an active grant
 * held by the caller covers the tool's `requiredCapability`. Nothing here
 * grants anything — this module only names the capabilities that exist.
 */

import type { Address, Capability, CapabilityGrant, ResourceRef } from "@aicoo/sharedos-contracts";

import { NAMESPACE, PURPOSE, SERVICE_NAMES, type ServiceName } from "../arena/config";

/** Action used for every ThesisBreaker service invocation. */
export const INVOKE = "invoke";

/** The resource that represents one callable Arena service. */
export function serviceResource(service: ServiceName): ResourceRef {
  return { namespace: NAMESPACE, path: ["service", service] };
}

/** The capability a caller must hold to invoke one service. */
export function serviceCapability(service: ServiceName): Capability {
  return {
    resource: serviceResource(service),
    actions: [INVOKE],
    scope: "exact",
  };
}

/**
 * Capabilities ThesisBreaker explicitly refuses to expose, for documentation
 * and for the denial test. These are never registered as tools, so the kernel
 * has nothing to authorize even if a caller claims them — the refusal is
 * structural, not a blocklist lookup.
 */
export const DENIED_CAPABILITIES = [
  "fs:read",
  "fs:write",
  "network:arbitrary",
  "wallet:*",
  "email:*",
  "process:spawn",
  "system:shell",
  "trade:execute",
  "identity:pii",
  "secrets:read",
] as const;

/**
 * A resource in this namespace that no tool backs and no grant covers. Used by
 * the authorization test to prove an unauthorized request is denied rather than
 * crashing the service.
 */
export function deniedResource(name: string): ResourceRef {
  return { namespace: NAMESPACE, path: ["denied", name] };
}

export interface GrantOptions {
  /** Services this grant authorizes. Anything omitted stays denied. */
  services: readonly ServiceName[];
  namespaceId: string;
  /** Must be exactly `context.actor`. */
  subject: Address;
  /** Must be exactly `context.authority`, or the kernel reports a scope mismatch. */
  issuer: Address;
  /**
   * When the grant took effect. Must be at or before the turn instant
   * (`context.now`) — the kernel treats a grant issued after the turn was
   * admitted as outside its validity window.
   */
  issuedAt: string;
  /** Optional expiry. */
  expiresAt?: string;
  grantId?: string;
}

function addressKey(address: Address): string {
  switch (address.kind) {
    case "human":
      return address.userId;
    case "agent":
      return address.agentId;
    case "group":
      return address.conversationId;
    case "service":
      return address.serviceId;
  }
}

/**
 * Build the capability grant that authorizes a caller to invoke the named
 * services, constrained to ThesisBreaker's purpose string.
 *
 * The grant is minted by the host (this product) for a caller it has admitted.
 * It never comes from the request body.
 */
export function buildServiceGrant(options: GrantOptions): CapabilityGrant {
  return {
    id: options.grantId ?? `grant_${addressKey(options.subject)}_${Date.now()}`,
    namespaceId: options.namespaceId,
    subject: options.subject,
    issuer: options.issuer,
    capabilities: options.services.map(serviceCapability),
    constraints: {
      purposes: [PURPOSE],
      ...(options.expiresAt ? { expiresAt: options.expiresAt } : {}),
    },
    issuedAt: options.issuedAt,
  };
}

/** Every service capability, for an operator-level grant. */
export function allServiceCapabilities(): Capability[] {
  return SERVICE_NAMES.map(serviceCapability);
}
