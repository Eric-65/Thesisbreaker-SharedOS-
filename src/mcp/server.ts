/**
 * ThesisBreaker MCP server (stdio).
 *
 * This is the primary direct-agent-access path: another agent connects over
 * MCP and calls the services with no human in the loop and no web page.
 *
 * The tools exposed here are thin transports. Every call goes through
 * `invokeService` → SharedOS kernel → authorization → reasoning pipeline. The
 * MCP layer cannot reach the pipeline on its own, so it cannot bypass SharedOS.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { PURPOSE, SERVICE_NAMES, type ServiceName } from "../lib/arena/config";
import { invokeService } from "../lib/services/invoke";
import { manifest, shortManifest } from "../lib/services/registry";
import { SERVICE_SCHEMAS } from "../lib/services/schemas";

const TOOL_PREFIX = "thesisbreaker.";
const CATALOG_TOOL = "thesisbreaker.catalog";

function toolNameFor(service: ServiceName): string {
  return `${TOOL_PREFIX}${service}`;
}

function serviceFromToolName(name: string): ServiceName | null {
  const bare = name.startsWith(TOOL_PREFIX) ? name.slice(TOOL_PREFIX.length) : name;
  return SERVICE_NAMES.includes(bare as ServiceName) ? (bare as ServiceName) : null;
}

/**
 * The MCP caller's identity. An MCP stdio session is one client, so the client
 * names itself at initialize time; we use that for the SharedOS actor rather
 * than letting a tool argument choose an identity.
 */
function callerFrom(clientName: string | undefined) {
  const id = (clientName ?? "").trim();
  return {
    agentId: id.length > 0 ? `mcp:${id}` : "mcp:anonymous",
    ...(id.length > 0 ? { name: id } : {}),
  };
}

export interface CreateServerOptions {
  /**
   * Caller identity for the SharedOS actor. Supplied by the HTTP transport
   * from an authenticated header; over stdio the session names itself at
   * initialize time and this is left unset.
   */
  callerAgentId?: string;
  callerName?: string;
}

export function createServer(options: CreateServerOptions = {}): Server {
  const server = new Server(
    { name: "thesisbreaker", version: "2.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: CATALOG_TOOL,
        description:
          "Return the ThesisBreaker service catalogue: what each service does, what it costs " +
          "in Arena credits, when to use it, and its input/output schema. Call this first if " +
          "you are deciding whether to buy.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
      },
      ...SERVICE_NAMES.map((service) => {
        const schema = SERVICE_SCHEMAS[service];
        return {
          name: toolNameFor(service),
          description: schema.agentDescription,
          inputSchema: schema.request as Record<string, unknown>,
          annotations: {
            title: `${service} (${schema.priceCredits} Arena credits)`,
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        };
      }),
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const caller = options.callerAgentId
      ? {
          agentId: options.callerAgentId,
          ...(options.callerName ? { name: options.callerName } : {}),
        }
      : callerFrom(server.getClientVersion()?.name);

    if (toolName === CATALOG_TOOL) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify(manifest(), null, 2) }],
        structuredContent: shortManifest() as unknown as Record<string, unknown>,
      };
    }

    const service = serviceFromToolName(toolName);
    if (!service) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: {
                code: "unknown_service",
                message: `unknown tool: ${toolName}`,
              },
              available: [CATALOG_TOOL, ...SERVICE_NAMES.map(toolNameFor)],
            }),
          },
        ],
      };
    }

    // A malformed or hostile payload must never crash the Arena service.
    const envelope = await invokeService(service, request.params.arguments ?? {}, { caller });

    return {
      isError: !envelope.success,
      content: [{ type: "text" as const, text: JSON.stringify(envelope, null, 2) }],
      structuredContent: envelope as unknown as Record<string, unknown>,
    };
  });

  return server;
}

export async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();

  // Startup diagnostics go to stderr — stdout is the MCP protocol channel.
  process.stderr.write(
    `${JSON.stringify({
      log: "thesisbreaker.mcp",
      event: "starting",
      purpose: PURPOSE,
      tools: [CATALOG_TOOL, ...SERVICE_NAMES.map(toolNameFor)],
      prices: Object.fromEntries(
        SERVICE_NAMES.map((s) => [s, SERVICE_SCHEMAS[s].priceCredits]),
      ),
    })}\n`,
  );

  await server.connect(transport);
  process.stderr.write(`${JSON.stringify({ log: "thesisbreaker.mcp", event: "ready" })}\n`);

  // An invalid request from another agent must not take the server down.
  process.on("uncaughtException", (err) => {
    process.stderr.write(
      `${JSON.stringify({ log: "thesisbreaker.mcp", event: "uncaught", error: err.message })}\n`,
    );
  });
  process.on("unhandledRejection", (reason) => {
    process.stderr.write(
      `${JSON.stringify({ log: "thesisbreaker.mcp", event: "unhandled", error: String(reason) })}\n`,
    );
  });
}
