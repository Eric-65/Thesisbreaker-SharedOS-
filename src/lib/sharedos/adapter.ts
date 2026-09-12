/**
 * SharedOS status and diagnostics.
 *
 * ThesisBreaker embeds the SharedOS kernel (`@aicoo/sharedos-core`) in-process:
 * the kernel IS the execution layer, not a remote service we call. That means
 * authorization and audit are always genuinely enforced, even before SharedNet
 * registration completes.
 *
 * What registration adds is Arena *identity* — a node id and agent address so
 * other agents can discover and pay this product. Status reporting below keeps
 * those two facts separate and never claims either one it cannot prove.
 */

import { IDENTITY, NAMESPACE, PURPOSE, isRegistered } from "../arena/config";
import { DENIED_CAPABILITIES } from "./capabilities";
import { getHost } from "./kernel";

export type KernelState = "ACTIVE" | "ERROR";
export type RegistrationState = "REGISTERED" | "UNREGISTERED";

export interface SharedOsStatus {
  /** The embedded kernel enforcing authorization for every service call. */
  kernel: {
    state: KernelState;
    package: string;
    policy: "DENY_BY_DEFAULT";
    registeredTools: string[];
    lastError?: string;
  };
  /** SharedNet identity. Supplied by the organizers at registration time. */
  registration: {
    state: RegistrationState;
    tenantId: string | null;
    productAgentAddress: string | null;
    sharednetNodeId: string | null;
    roomId: string | null;
    missing: string[];
  };
  purpose: string;
  namespace: string;
  deniedCapabilities: readonly string[];
  checkedAt: string;
}

const SDK_PACKAGE = "@aicoo/sharedos-core@0.1.0-alpha.5";

export async function getSharedOsStatus(): Promise<SharedOsStatus> {
  let kernelState: KernelState = "ACTIVE";
  let lastError: string | undefined;
  let registeredTools: string[] = [];

  try {
    // A probe caller. Listing is itself authorized, so a success here proves
    // the kernel is resolving authority and filtering the catalogue for real.
    const tools = await getHost().listToolsFor({ agentId: "thesisbreaker.selftest" });
    registeredTools = tools.map((t) => t.name).sort();
  } catch (err) {
    kernelState = "ERROR";
    lastError = (err as Error).message;
  }

  const missing: string[] = [];
  if (!IDENTITY.tenantId) missing.push("SHAREDOS_TENANT_ID");
  if (!IDENTITY.productAgentAddress) missing.push("SHAREDOS_AGENT_ADDRESS");
  if (!IDENTITY.sharednetNodeId) missing.push("SHAREDNET_NODE_ID");
  if (!IDENTITY.ownerAddress) missing.push("SHAREDOS_OWNER_ADDRESS");

  return {
    kernel: {
      state: kernelState,
      package: SDK_PACKAGE,
      policy: "DENY_BY_DEFAULT",
      registeredTools,
      ...(lastError ? { lastError } : {}),
    },
    registration: {
      state: isRegistered() ? "REGISTERED" : "UNREGISTERED",
      tenantId: IDENTITY.tenantId,
      productAgentAddress: IDENTITY.productAgentAddress,
      sharednetNodeId: IDENTITY.sharednetNodeId,
      roomId: IDENTITY.sharednetRoomId,
      missing,
    },
    purpose: PURPOSE,
    namespace: NAMESPACE,
    deniedCapabilities: DENIED_CAPABILITIES,
    checkedAt: new Date().toISOString(),
  };
}

/** Recent kernel audit events, for the diagnostics view. */
export function recentAuditEvents(limit = 50) {
  return getHost().audit.recent(limit);
}
