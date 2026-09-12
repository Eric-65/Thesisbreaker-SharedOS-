/**
 * The trusted grant boundary.
 *
 * This is the ONLY way authority enters the SharedOS kernel. It answers from
 * host-owned policy, never from anything in the caller's request body — a
 * caller cannot present, extend or replay authority by crafting a payload.
 *
 * ThesisBreaker's Arena policy is deliberately narrow: an admitted caller is
 * issued capabilities for the services this product sells, constrained to the
 * product's purpose string, and nothing else. There is no grant in this system
 * for filesystem, network, wallet, email, shell or trade-execution resources,
 * so a request for one finds no matching grant and is denied by the kernel.
 */

import type { AccessContext, CapabilityGrant } from "@aicoo/sharedos-contracts";
import type { GrantSource } from "@aicoo/sharedos-core";

import { SERVICE_NAMES, type ServiceName } from "../arena/config";
import { buildServiceGrant } from "./capabilities";

/**
 * Decides which services a given caller is entitled to invoke.
 *
 * The Arena settles after delivery — an agent calls, receives the result, then
 * transfers credits — so entitlement is not a prepayment check. It is the
 * admission decision: is this caller allowed to use this product at all, and
 * for which services.
 */
export interface EntitlementStore {
  servicesFor(agentId: string): Promise<readonly ServiceName[]>;
}

/** Sells every listed service to any admitted Arena caller. */
export class OpenArenaEntitlementStore implements EntitlementStore {
  readonly #blocked: Set<string>;

  constructor(blocked: readonly string[] = []) {
    this.#blocked = new Set(blocked);
  }

  block(agentId: string): void {
    this.#blocked.add(agentId);
  }

  async servicesFor(agentId: string): Promise<readonly ServiceName[]> {
    if (this.#blocked.has(agentId)) return [];
    return SERVICE_NAMES;
  }
}

/** Grants only the free tier. Used to prove paid services stay denied. */
export class FreeTierOnlyEntitlementStore implements EntitlementStore {
  async servicesFor(): Promise<readonly ServiceName[]> {
    return ["free_preview"];
  }
}

/** Grants nothing. Used to prove the kernel fails closed. */
export class NoEntitlementStore implements EntitlementStore {
  async servicesFor(): Promise<readonly ServiceName[]> {
    return [];
  }
}

export class ThesisBreakerGrantSource implements GrantSource {
  readonly #entitlements: EntitlementStore;

  constructor(entitlements: EntitlementStore = new OpenArenaEntitlementStore()) {
    this.#entitlements = entitlements;
  }

  async load(context: AccessContext): Promise<readonly CapabilityGrant[]> {
    // The kernel requires grants issued to `context.actor` by `context.authority`
    // within `context.namespaceId`. Anything outside that scope is treated as an
    // unavailable source, so we only ever answer for an agent actor.
    if (context.actor.kind !== "agent") return [];

    const services = await this.#entitlements.servicesFor(context.actor.agentId);
    if (services.length === 0) return [];

    return [
      buildServiceGrant({
        services,
        namespaceId: context.namespaceId,
        // Exactly the addresses the kernel will check the grant scope against.
        subject: context.actor,
        issuer: context.authority,
        // The turn instant: a grant issued after admission is outside its window.
        issuedAt: context.now,
      }),
    ];
  }
}
