/**
 * THE service layer.
 *
 * MCP, the CLI, the SharedNet Arena agent and the web API all call
 * `invokeService`. None of them reach the reasoning pipeline directly, and none
 * of them can skip SharedOS: this function's only execution path is
 * `ThesisBreakerHost.runServiceTurn`, which authorizes through the kernel.
 *
 * The response envelope is stable across every transport, so an agent that
 * learned it over MCP can use the HTTP endpoint unchanged.
 */

import { PRICES, type ServiceName } from "../arena/config";
import { recordServiceCall } from "./call-log";
import type { ServiceError } from "./contracts";
import { getHost, type Caller } from "../sharedos/kernel";

export interface ServiceSuccess<T> {
  success: true;
  service: ServiceName;
  request_id: string;
  price_credits: number;
  currency: "Arena credits";
  execution: {
    sharedos: true;
    purpose: string;
    trace_id: string;
    duration_ms: number;
  };
  result: T;
  /** Present on paid services: how to settle. */
  payment?: {
    amount: number;
    currency: "Arena credits";
    memo: string;
    instruction: string;
  };
}

export interface ServiceFailureEnvelope {
  success: false;
  service: ServiceName;
  request_id: string;
  error: ServiceError;
  execution: {
    sharedos: true;
    purpose: string;
    trace_id: string;
    duration_ms: number;
  };
}

export type ServiceEnvelope<T = unknown> = ServiceSuccess<T> | ServiceFailureEnvelope;

export interface InvokeOptions {
  caller: Caller;
  requestId?: string;
  /** Skip usage logging (used by health checks so probes don't bill). */
  log?: boolean;
}

export async function invokeService<T = unknown>(
  service: ServiceName,
  rawArguments: unknown,
  options: InvokeOptions,
): Promise<ServiceEnvelope<T>> {
  const outcome = await getHost().runServiceTurn<T>(service, rawArguments, options.caller, {
    ...(options.requestId ? { requestId: options.requestId } : {}),
  });

  const execution = {
    sharedos: true as const,
    purpose: outcome.purpose,
    trace_id: outcome.traceId,
    duration_ms: outcome.durationMs,
  };

  if (options.log !== false) {
    void recordServiceCall({
      service,
      requestId: outcome.requestId,
      caller: options.caller,
      ok: outcome.ok,
      durationMs: outcome.durationMs,
      priceCredits: PRICES[service],
      ...(outcome.denied ? { deniedReason: outcome.denied.message } : {}),
      ...(outcome.error ? { errorCode: outcome.error.code } : {}),
    });
  }

  if (!outcome.ok) {
    return {
      success: false,
      service,
      request_id: outcome.requestId,
      error: outcome.error ?? { code: "internal_error", message: "service failed" },
      execution,
    };
  }

  const price = PRICES[service];
  return {
    success: true,
    service,
    request_id: outcome.requestId,
    price_credits: price,
    currency: "Arena credits",
    execution,
    result: outcome.data as T,
    ...(price > 0
      ? {
          payment: {
            amount: price,
            currency: "Arena credits" as const,
            memo: outcome.requestId,
            instruction: `sharednet pay <thesisbreaker-agent> ${price} --memo ${outcome.requestId}`,
          },
        }
      : {}),
  };
}
