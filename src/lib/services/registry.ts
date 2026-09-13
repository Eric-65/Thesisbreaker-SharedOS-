/**
 * SharedNet service discovery.
 *
 * The manifest is written so another agent can answer, in one fetch and without
 * reading the README:
 *   WHAT IS THIS?  WHAT DOES IT COST?  WHEN SHOULD I USE IT?
 *   WHAT DO I SEND?  WHAT DO I GET?
 */

import { CURRENCY, IDENTITY, NAMESPACE, PRICES, PURPOSE, type ServiceName } from "../arena/config";
import { DENIED_CAPABILITIES } from "../sharedos/capabilities";
import { SERVICE_LIST, SERVICE_SCHEMAS, type ServiceSchema } from "./schemas";

export { PURPOSE, type ServiceName };
export { SERVICE_SCHEMAS, SERVICE_LIST };

export function getService(name: string): ServiceSchema | undefined {
  return SERVICE_LIST.find((s) => s.name === name);
}

export interface ManifestOptions {
  publicBaseUrl?: string;
}

/** The machine-readable product manifest published for SharedNet discovery. */
export function manifest(options: ManifestOptions = {}) {
  const base = options.publicBaseUrl?.replace(/\/$/, "");

  return {
    product: "ThesisBreaker",
    tagline: "Break a decision before an agent acts on it.",
    value_proposition:
      "Before you act on a decision, ThesisBreaker tries to break it. It checks supporting " +
      "evidence, contradictions, assumptions, risks and invalidation conditions, then returns " +
      "a structured verdict you can act on.",
    version: "2.0.0",
    currency: CURRENCY,
    purpose: PURPOSE,
    namespace: NAMESPACE,
    permissions_model: "deny-by-default",
    execution: {
      layer: "SharedOS",
      package: "@aicoo/sharedos-core",
      note: "Every paid service call is authorized and audited by the SharedOS kernel. There is no execution path that bypasses it.",
    },
    agent: {
      product_agent_address: IDENTITY.productAgentAddress,
      sharednet_node_id: IDENTITY.sharednetNodeId,
      room_id: IDENTITY.sharednetRoomId,
      registered: IDENTITY.productAgentAddress !== null && IDENTITY.sharednetNodeId !== null,
    },
    pricing: {
      free_preview: PRICES.free_preview,
      verify_claim: PRICES.verify_claim,
      break_thesis: PRICES.break_thesis,
    },
    payment: {
      model: "settle-after-delivery",
      mechanism: "SharedNet Arena credits",
      instruction:
        "Call the service, receive the result, then transfer the listed credits with `sharednet pay <agent> <amount> --memo <request_id>`. Include the request_id so the transfer can be reconciled.",
    },
    denied_capabilities: DENIED_CAPABILITIES,
    access: {
      mcp: {
        transport: "stdio",
        command: "npx -p thesisbreaker thesisbreaker-mcp",
        tools: SERVICE_LIST.map((s) => `thesisbreaker.${s.name}`),
      },
      cli: {
        command: "thesisbreaker",
        examples: [
          'thesisbreaker free-preview --thesis "..."',
          'thesisbreaker verify-claim --claim "..." --evidence "..."',
          'thesisbreaker break-thesis --thesis "..." --json',
        ],
      },
      http: base
        ? {
            manifest: `${base}/api/agent/manifest`,
            health: `${base}/api/arena/health`,
            services: SERVICE_LIST.map((s) => `${base}/api/agent/services/${s.name}`),
          }
        : undefined,
    },
    services: SERVICE_LIST.map((s) => ({
      name: s.name,
      version: s.version,
      summary: s.summary,
      description: s.agentDescription,
      use_when: s.useWhen,
      price: s.priceCredits,
      currency: s.currency,
      paid: s.priceCredits > 0,
      expected_latency_ms: s.expectedLatencyMs,
      expected_latency: `${(s.expectedLatencyMs / 1000).toFixed(2)}s typical, <5 minutes guaranteed`,
      timeout_ms: s.timeoutMs,
      purpose: PURPOSE,
      input_schema: s.request,
      output_schema: s.response,
      example: s.example,
      mcp_tool: `thesisbreaker.${s.name}`,
      endpoint: base ? `${base}/api/agent/services/${s.name}` : `/api/agent/services/${s.name}`,
      method: "POST",
      content_type: "application/json",
    })),
  };
}

/** A deliberately tiny summary — the cheapest possible way to evaluate us. */
export function shortManifest() {
  return {
    product: "ThesisBreaker",
    what: "Stress-tests a decision before an agent acts on it. Returns a structured verdict.",
    services: SERVICE_LIST.map((s) => ({
      name: s.name,
      price: s.priceCredits,
      currency: s.currency,
      what: s.summary,
      use_when: s.useWhen,
    })),
    call_via: "MCP (stdio) · CLI · HTTP POST",
    purpose: PURPOSE,
  };
}
