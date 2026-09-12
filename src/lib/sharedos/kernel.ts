/**
 * The SharedOS execution layer.
 *
 * Every Arena-facing service call — from MCP, the CLI, the SharedNet agent or
 * the web API — runs through `runServiceTurn` here. There is no second path
 * that reaches the reasoning pipeline: the pipeline is only ever called from
 * inside a registered SharedOS tool handler, which the kernel invokes after it
 * has authorized the call against a grant it loaded itself.
 *
 * This uses the real `@aicoo/sharedos-core` kernel. Authorization, tool
 * filtering, deny-by-default refusal and audit events are the SDK's, not ours.
 */

import type {
  AccessContext,
  Address,
  JsonObject,
  ToolCall,
  ToolDefinition,
  ToolResult,
} from "@aicoo/sharedos-contracts";
import {
  CompositeAuditSink,
  SharedOSKernel,
  type AuditSink,
  type ToolHandler,
} from "@aicoo/sharedos-core";

import {
  IDENTITY,
  NAMESPACE,
  PURPOSE,
  SERVICE_NAMES,
  TIMEOUTS,
  type ServiceName,
} from "../arena/config";
import { runDecisionPipeline, runVerifyClaimPipeline } from "../decision/pipeline";
import { runFreePreview } from "../services/free_preview";
import {
  VALIDATORS,
  type BreakThesisRequest,
  type PreviewRequest,
  type ServiceError,
  type VerifyClaimRequest,
} from "../services/contracts";
import { SERVICE_SCHEMAS } from "../services/schemas";
import { DatabaseAuditSink, MemoryAuditSink, StructuredLogAuditSink, memoryAudit } from "./audit-sink";
import { INVOKE, serviceResource } from "./capabilities";
import { OpenArenaEntitlementStore, ThesisBreakerGrantSource, type EntitlementStore } from "./grants";

export interface Caller {
  /** Stable agent identifier of the calling agent. */
  agentId: string;
  /** Display name, audit only. */
  name?: string;
}

export interface TurnOutcome<T> {
  ok: boolean;
  service: ServiceName;
  purpose: string;
  requestId: string;
  traceId: string;
  durationMs: number;
  data?: T;
  error?: ServiceError;
  /** Present when SharedOS refused the call. */
  denied?: { reasonCode: string; message: string };
}

// ------------------------------------------------------------ tool definitions

function toolName(service: ServiceName): string {
  return `thesisbreaker.${service}`;
}

function definitionFor(service: ServiceName): ToolDefinition {
  const schema = SERVICE_SCHEMAS[service];
  return {
    name: toolName(service),
    description: schema.agentDescription,
    namespace: NAMESPACE,
    source: "thesisbreaker",
    readWrite: "read",
    inputSchema: schema.request as unknown as JsonObject,
    outputSchema: schema.response as unknown as JsonObject,
    requiredCapability: { resource: serviceResource(service), action: INVOKE },
    annotations: { readOnly: true, idempotent: true, destructive: false },
    metadata: { price_credits: schema.priceCredits, currency: "Arena credits" },
  };
}

/** Runs one service. This is the only place the reasoning pipeline is called. */
function executeService(service: ServiceName, request: unknown): unknown {
  switch (service) {
    case "free_preview":
      return runFreePreview(request as PreviewRequest);
    case "verify_claim":
      return runVerifyClaimPipeline(request as VerifyClaimRequest);
    case "break_thesis": {
      const r = request as BreakThesisRequest;
      return runDecisionPipeline({
        statement: r.thesis,
        ...(r.context ? { context: r.context } : {}),
        ...(r.evidence ? { evidence: r.evidence } : {}),
        ...(r.sources ? { sources: r.sources } : {}),
        ...(r.constraints ? { constraints: r.constraints } : {}),
        ...(r.objective ? { objective: r.objective } : {}),
        ...(r.domain ? { domain: r.domain } : {}),
      });
    }
  }
}

class ServiceToolHandler implements ToolHandler {
  readonly definition: ToolDefinition;
  readonly #service: ServiceName;

  constructor(service: ServiceName) {
    this.#service = service;
    this.definition = definitionFor(service);
  }

  /** Untrusted arguments are normalized and bounded before authorization. */
  parseArguments = (args: JsonObject): unknown => {
    const result = VALIDATORS[this.#service](args);
    if (!result.ok) {
      throw new ServiceValidationError(result.error);
    }
    return result.value;
  };

  // Arrow property, not a method: `ToolRegistry` stores `handler.invoke`
  // detached from the handler, so a prototype method would lose `this`.
  invoke = async (
    _context: AccessContext,
    call: ToolCall,
    signal: AbortSignal,
  ): Promise<ToolResult> => {
    const completedAt = () => new Date().toISOString();
    const parsed = VALIDATORS[this.#service](call.arguments);
    if (!parsed.ok) {
      return {
        status: "failed",
        callId: call.id,
        tool: call.tool,
        completedAt: completedAt(),
        error: { code: parsed.error.code, message: parsed.error.message },
      };
    }

    if (signal.aborted) {
      return {
        status: "failed",
        callId: call.id,
        tool: call.tool,
        completedAt: completedAt(),
        error: { code: "timeout", message: "the turn was cancelled before execution" },
      };
    }

    try {
      const output = executeService(this.#service, parsed.value);
      return {
        status: "succeeded",
        callId: call.id,
        tool: call.tool,
        completedAt: completedAt(),
        output: output as never,
      };
    } catch (err) {
      return {
        status: "failed",
        callId: call.id,
        tool: call.tool,
        completedAt: completedAt(),
        error: { code: "internal_error", message: (err as Error).message },
      };
    }
  };
}

export class ServiceValidationError extends Error {
  readonly detail: ServiceError;
  constructor(detail: ServiceError) {
    super(detail.message);
    this.name = "ServiceValidationError";
    this.detail = detail;
  }
}

// ------------------------------------------------------------------- the host

export interface HostOptions {
  entitlements?: EntitlementStore;
  auditSinks?: AuditSink[];
}

export class ThesisBreakerHost {
  readonly kernel: SharedOSKernel;
  readonly audit: MemoryAuditSink;

  constructor(options: HostOptions = {}) {
    this.audit = options.auditSinks ? new MemoryAuditSink() : memoryAudit;
    const sinks: AuditSink[] = options.auditSinks ?? [
      this.audit,
      new StructuredLogAuditSink(),
      new DatabaseAuditSink(),
    ];

    this.kernel = new SharedOSKernel({
      grantSource: new ThesisBreakerGrantSource(
        options.entitlements ?? new OpenArenaEntitlementStore(),
      ),
      audit: new CompositeAuditSink(sinks),
      onProviderError: (error, operation) => {
        console.warn("[sharedos] provider error:", operation, (error as Error)?.message ?? error);
      },
    });

    for (const service of SERVICE_NAMES) {
      this.kernel.registerTool(new ServiceToolHandler(service));
    }
  }

  /** The address this product runs on behalf of. */
  #owner(): Address {
    return IDENTITY.ownerAddress
      ? { kind: "human", userId: IDENTITY.ownerAddress }
      : { kind: "service", serviceId: "thesisbreaker" };
  }

  #authority(): Address {
    return IDENTITY.productAgentAddress
      ? { kind: "agent", agentId: IDENTITY.productAgentAddress }
      : { kind: "service", serviceId: "thesisbreaker" };
  }

  /**
   * Build the trusted access context. Never constructed from a request body:
   * the caller identity comes from the transport's authenticated view, and the
   * purpose is fixed by this product.
   */
  buildContext(caller: Caller, traceId: string): AccessContext {
    return {
      namespaceId: IDENTITY.tenantId ?? NAMESPACE,
      actor: { kind: "agent", agentId: caller.agentId },
      authority: this.#authority(),
      owner: this.#owner(),
      purpose: PURPOSE,
      traceId,
      enabledToolNamespaces: [NAMESPACE],
      now: new Date().toISOString(),
    };
  }

  /** Tools this caller may actually see — already permission-filtered. */
  async listToolsFor(caller: Caller): Promise<readonly ToolDefinition[]> {
    const context = this.buildContext(caller, newId("trace"));
    const scope = await this.kernel.openTurnAuthority(context);
    try {
      return await this.kernel.listTools(context);
    } finally {
      scope.close();
    }
  }

  /**
   * Execute one service as a complete SharedOS turn: resolve authority, invoke
   * the tool through the kernel (which authorizes it), record how the turn
   * ended. Never throws — an Arena customer always receives a structured result.
   */
  async runServiceTurn<T>(
    service: ServiceName,
    rawArguments: unknown,
    caller: Caller,
    options: { requestId?: string; timeoutMs?: number } = {},
  ): Promise<TurnOutcome<T>> {
    const startedAt = Date.now();
    const requestId = options.requestId ?? newId("req");
    const traceId = newId("trace");
    const context = this.buildContext(caller, traceId);
    const timeoutMs = options.timeoutMs ?? TIMEOUTS[service];

    const base = {
      service,
      purpose: PURPOSE,
      requestId,
      traceId,
    };

    if (!SERVICE_NAMES.includes(service)) {
      return {
        ...base,
        ok: false,
        durationMs: Date.now() - startedAt,
        error: { code: "unknown_service", message: `unknown service: ${service}` },
      };
    }

    const args = asJsonObject(rawArguments);
    if (!args) {
      return {
        ...base,
        ok: false,
        durationMs: Date.now() - startedAt,
        error: { code: "invalid_payload", message: "request body must be a JSON object" },
      };
    }

    // Validate before opening a turn. A malformed payload is rejected with the
    // exact field error rather than the kernel's coarse `invalid_tool_arguments`,
    // and garbage never reaches authorization. The tool handler re-validates
    // anyway, so this is a better error message, not the only check.
    const validated = VALIDATORS[service](args);
    if (!validated.ok) {
      return {
        ...base,
        ok: false,
        durationMs: Date.now() - startedAt,
        error: validated.error,
      };
    }

    const scope = await this.kernel.openTurnAuthority(context);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      if (scope.status === "unavailable") {
        await this.kernel.recordTurnEnd(context, {
          executionId: requestId,
          status: "denied",
          reasonCode: scope.code ?? "authority_unavailable",
          endedBy: "envelope",
        });
        return {
          ...base,
          ok: false,
          durationMs: Date.now() - startedAt,
          denied: {
            reasonCode: scope.code ?? "authority_unavailable",
            message:
              "SharedOS could not establish authority for this turn; the call was refused.",
          },
          error: {
            code: "unauthorized",
            message: "SharedOS authority unavailable — request refused (fail-closed).",
          },
        };
      }

      const call: ToolCall = {
        id: requestId,
        tool: toolName(service),
        arguments: args,
        traceId,
        requestedAt: new Date().toISOString(),
      };

      const result = await this.kernel.invokeTool(context, call, { signal: controller.signal });
      const durationMs = Date.now() - startedAt;

      if (result.status === "succeeded") {
        await this.kernel.recordTurnEnd(context, {
          executionId: requestId,
          status: "succeeded",
          endedBy: "envelope",
        });
        return { ...base, ok: true, durationMs, data: result.output as T };
      }

      if (result.status === "denied") {
        await this.kernel.recordTurnEnd(context, {
          executionId: requestId,
          status: "denied",
          reasonCode: result.error.code,
          endedBy: "envelope",
        });
        return {
          ...base,
          ok: false,
          durationMs,
          denied: { reasonCode: result.error.code, message: result.error.message },
          error: {
            code: "unauthorized",
            message: `SharedOS denied this call: ${result.error.message}`,
          },
        };
      }

      await this.kernel.recordTurnEnd(context, {
        executionId: requestId,
        status: "failed",
        reasonCode: result.error.code,
        endedBy: "envelope",
      });
      return {
        ...base,
        ok: false,
        durationMs,
        error: {
          code: (result.error.code as ServiceError["code"]) ?? "internal_error",
          message: result.error.message,
        },
      };
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      const aborted = controller.signal.aborted;
      await this.kernel
        .recordTurnEnd(context, {
          executionId: requestId,
          status: aborted ? "cancelled" : "failed",
          reasonCode: aborted ? "turn_cancelled" : "host_error",
          endedBy: "envelope",
        })
        .catch(() => {});
      return {
        ...base,
        ok: false,
        durationMs,
        error: aborted
          ? { code: "timeout", message: `service exceeded its ${timeoutMs}ms budget` }
          : { code: "internal_error", message: (err as Error).message },
      };
    } finally {
      clearTimeout(timer);
      scope.close();
    }
  }
}

// --------------------------------------------------------------------- helpers

function asJsonObject(raw: unknown): JsonObject | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  try {
    return JSON.parse(JSON.stringify(raw)) as JsonObject;
  } catch {
    return null;
  }
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

let shared: ThesisBreakerHost | null = null;

/** Process-wide host. Request-scoped state lives in the turn, never here. */
export function getHost(): ThesisBreakerHost {
  if (!shared) shared = new ThesisBreakerHost();
  return shared;
}
