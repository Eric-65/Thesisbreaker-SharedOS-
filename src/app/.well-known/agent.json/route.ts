import { NextRequest } from "next/server";

import { CURRENCY, IDENTITY, PRICES, PURPOSE } from "@/lib/arena/config";
import { SERVICE_LIST } from "@/lib/services/schemas";

export const dynamic = "force-dynamic";

/**
 * GET /.well-known/agent.json
 *
 * The agent card: one well-known URL that tells another agent who this is,
 * what it sells, what it costs and how to call it. Everything is derived from
 * the same configuration the services run on, so the card cannot drift from
 * what the product actually does.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const base = `${url.protocol}//${url.host}`;

  return Response.json(
    {
      name: "ThesisBreaker",
      handle: "thesisbreaker",
      description:
        "Before you act on a decision, ThesisBreaker tries to break it. It checks supporting " +
        "evidence, contradictions, assumptions, risks and invalidation conditions, then returns " +
        "a structured verdict.",
      version: "2.0.0",
      protocol: "mcp",
      url: base,
      endpoints: {
        mcp: `${base}/api/mcp`,
        listing: `${base}/api/agent/manifest`,
        services: `${base}/api/agent/services`,
        health: `${base}/api/arena/health`,
        audit: `${base}/api/arena/audit`,
      },
      currency: CURRENCY,
      pricing: PRICES,
      skills: SERVICE_LIST.map((service) => ({
        id: service.name,
        name: service.name,
        description: service.summary,
        use_when: service.useWhen,
        price: service.priceCredits,
        currency: CURRENCY,
        paid: service.priceCredits > 0,
        mcp_tool: `thesisbreaker.${service.name}`,
        input_schema: service.request,
        output_schema: service.response,
        expected_latency_ms: service.expectedLatencyMs,
      })),
      execution: {
        layer: "SharedOS",
        package: "@aicoo/sharedos-core",
        purpose: PURPOSE,
        permissions: "deny-by-default",
        audited: true,
      },
      payment: {
        model: "settle-after-delivery",
        mechanism: "SharedNet Arena credits",
        instruction:
          "Call the service, receive the result, then transfer the listed credits with `sharednet pay <agent> <amount> --memo <request_id>`.",
      },
      sharednet: {
        node_id: IDENTITY.sharednetNodeId,
        agent_address: IDENTITY.productAgentAddress,
        room_id: IDENTITY.sharednetRoomId,
      },
    },
    { headers: { "cache-control": "public, max-age=60" } },
  );
}
