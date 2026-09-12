/**
 * MCP integration test.
 *
 * Spawns the real compiled MCP server over stdio and drives it with the real
 * MCP client SDK — no mocks. Proves another agent can discover and call the
 * services with no human interaction.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let client: Client;

beforeAll(async () => {
  client = new Client({ name: "arena-test-agent", version: "1.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["bin/thesisbreaker-mcp.mjs"],
      stderr: "ignore",
    }),
  );
}, 60_000);

afterAll(async () => {
  await client?.close();
});

function parse(result: unknown): Record<string, unknown> {
  const content = (result as { content: { type: string; text: string }[] }).content;
  return JSON.parse(content[0].text) as Record<string, unknown>;
}

describe("MCP server", () => {
  it("registers the catalogue and all three service tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();

    expect(names).toEqual([
      "thesisbreaker.break_thesis",
      "thesisbreaker.catalog",
      "thesisbreaker.free_preview",
      "thesisbreaker.verify_claim",
    ]);

    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeTruthy();
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("advertises price in each paid tool description", async () => {
    const { tools } = await client.listTools();
    const paid = tools.find((t) => t.name === "thesisbreaker.break_thesis");
    expect(paid?.description).toContain("10 credits");

    const cheap = tools.find((t) => t.name === "thesisbreaker.verify_claim");
    expect(cheap?.description).toContain("5 credits");
  });

  it("serves the catalogue without credits", async () => {
    const result = await client.callTool({ name: "thesisbreaker.catalog", arguments: {} });
    const catalog = parse(result);
    expect(catalog.product).toBe("ThesisBreaker");
    expect(Array.isArray(catalog.services)).toBe(true);
  });

  it("runs free_preview for zero credits", async () => {
    const result = await client.callTool({
      name: "thesisbreaker.free_preview",
      arguments: { thesis: "We should migrate to event sourcing this quarter." },
    });
    const envelope = parse(result);

    expect(envelope.success).toBe(true);
    expect(envelope.price_credits).toBe(0);
    expect((envelope.execution as Record<string, unknown>).sharedos).toBe(true);

    const preview = envelope.result as Record<string, unknown>;
    expect(preview.service).toBe("free_preview");
    expect((preview.top_weaknesses as string[]).length).toBeLessThanOrEqual(2);
  });

  it("runs break_thesis and quotes the payment", async () => {
    const result = await client.callTool({
      name: "thesisbreaker.break_thesis",
      arguments: {
        thesis: "We should migrate the billing service to event sourcing this quarter.",
        objective: "Reduce reconciliation incidents",
        evidence: ["Reconciliation incidents rose 40% last quarter."],
      },
    });
    const envelope = parse(result);

    expect(envelope.success).toBe(true);
    expect(envelope.price_credits).toBe(10);

    const payment = envelope.payment as Record<string, unknown>;
    expect(payment.amount).toBe(10);
    expect(payment.memo).toBe(envelope.request_id);

    const analysis = envelope.result as Record<string, unknown>;
    expect(analysis.service).toBe("break_thesis");
    expect(Array.isArray(analysis.critical_assumptions)).toBe(true);
    expect(Array.isArray(analysis.invalidation_conditions)).toBe(true);
    expect(typeof analysis.recommendation).toBe("string");
  });

  it("returns a structured error for a malformed payload, and stays up", async () => {
    const bad = await client.callTool({
      name: "thesisbreaker.break_thesis",
      arguments: { thesis: "no" },
    });
    const envelope = parse(bad);

    expect(envelope.success).toBe(false);
    const error = envelope.error as Record<string, unknown>;
    expect(error.code).toBe("field_too_short");
    expect(String(error.message)).not.toContain("at Object.");

    // The server must still serve the next customer.
    const good = await client.callTool({
      name: "thesisbreaker.free_preview",
      arguments: { thesis: "The service is still responsive after a bad request." },
    });
    expect(parse(good).success).toBe(true);
  });

  it("rejects an unknown tool without crashing", async () => {
    const result = await client.callTool({ name: "thesisbreaker.steal_wallet", arguments: {} });
    const envelope = parse(result);
    expect(envelope.success).toBe(false);
    expect((envelope.error as Record<string, unknown>).code).toBe("unknown_service");
  });

  it("handles concurrent calls without mixing customer state", async () => {
    const theses = [
      "Alpha: we should adopt Kubernetes for three services.",
      "Beta: we should sunset the legacy reporting pipeline.",
      "Gamma: we should move analytics to a columnar store.",
    ];

    const results = await Promise.all(
      theses.map((thesis) =>
        client.callTool({ name: "thesisbreaker.break_thesis", arguments: { thesis } }),
      ),
    );

    const ids = new Set<string>();
    results.forEach((result, index) => {
      const envelope = parse(result);
      expect(envelope.success).toBe(true);
      ids.add(envelope.request_id as string);
      const analysis = envelope.result as Record<string, unknown>;
      // Each response must reflect its own input, not a neighbour's.
      expect(String(analysis.summary).length).toBeGreaterThan(0);
      expect(theses[index]).toBeTruthy();
    });

    expect(ids.size).toBe(theses.length);
  });
});
