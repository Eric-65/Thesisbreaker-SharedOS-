import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { createServer } from "@/mcp/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/mcp — MCP over Streamable HTTP.
 *
 * The stdio server requires the caller to run ThesisBreaker locally. This is
 * the transport a remote agent actually uses: another agent anywhere on
 * SharedNet can list and call the tools over the network with no human step.
 *
 * Stateless by design — no session id generator, so every request builds its
 * own server and transport and nothing is shared between callers. That matters
 * for correctness as much as for serverless: one customer's turn can never
 * observe another's.
 *
 * Tool calls still run through `invokeService` → SharedOS kernel, so this
 * endpoint has no more authority than any other transport.
 */
export async function POST(req: Request): Promise<Response> {
  const callerAgentId = req.headers.get("x-caller-agent-id")?.trim();
  const callerName = req.headers.get("x-caller-name")?.trim();

  const server = createServer({
    ...(callerAgentId ? { callerAgentId } : {}),
    ...(callerName ? { callerName } : {}),
  });

  const transport = new WebStandardStreamableHTTPServerTransport({
    // Stateless: no session persistence between requests.
    sessionIdGenerator: undefined,
    // Plain JSON responses rather than an SSE stream — simpler for agents that
    // just want a request/response call.
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    return await transport.handleRequest(req);
  } catch (err) {
    // An agent customer receives structured JSON-RPC, never a stack trace.
    return Response.json(
      {
        jsonrpc: "2.0",
        error: { code: -32603, message: `internal error: ${(err as Error).message}` },
        id: null,
      },
      { status: 500 },
    );
  } finally {
    await transport.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

/** GET/DELETE are only meaningful for session-based streaming, which is off. */
export async function GET(): Promise<Response> {
  return Response.json(
    {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message:
          "This MCP endpoint is stateless. POST a JSON-RPC request; SSE streams and sessions are not used.",
      },
      id: null,
    },
    { status: 405, headers: { allow: "POST" } },
  );
}
