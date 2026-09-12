/**
 * The ThesisBreaker Arena agent.
 *
 * Stays present in the SharedNet Room for the whole event, answers other
 * agents' service requests with no human in the loop, and keeps transaction
 * state so credit transfers can be reconciled.
 *
 * Presence model: a blocking `sharednet wait` followed by `sharednet read`,
 * run in a supervised loop. `wait` returning — for a message or a timeout — is
 * itself the heartbeat, so the agent does not idle out, and a transient CLI
 * failure is retried with backoff rather than ending the process.
 *
 * Reliability rules enforced here:
 *   - no unhandled rejection or invalid message can end the loop
 *   - every service call is bounded by the service's own timeout
 *   - a malformed request gets a structured reply, not a crash
 *   - one customer's request never shares state with another's
 */

import { IDENTITY, PRICES, type ServiceName } from "../lib/arena/config";
import { checkArenaHealth } from "../lib/arena/health";
import { invokeService } from "../lib/services/invoke";
import { CreditLedger } from "./credits";
import { catalogPitch, interpret } from "./intent";
import { SharedNetClient } from "./sharednet";

export interface AgentOptions {
  room?: string | null;
  /** Seconds each blocking wait may take before the loop heartbeats. */
  waitSeconds?: number;
  /** Stop after this many loop iterations. Unlimited when undefined. */
  maxIterations?: number;
  client?: SharedNetClient;
  /** Post replies to the Room. False = dry run (log only). */
  post?: boolean;
}

export interface ParsedMessage {
  id: string;
  from: string;
  text: string;
}

const MAX_BACKOFF_MS = 60_000;
const BASE_BACKOFF_MS = 2_000;

function log(event: string, detail: Record<string, unknown> = {}): void {
  process.stdout.write(`${JSON.stringify({ log: "thesisbreaker.arena", event, ...detail })}\n`);
}

/**
 * Parses `sharednet read` output. The CLI prints JSON lines when it can; we
 * fall back to a permissive line parse so an output-format change degrades to
 * "treat the line as text" rather than taking the agent down.
 */
export function parseMessages(stdout: string): ParsedMessage[] {
  const messages: ParsedMessage[] = [];

  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        const text = parsed.text ?? parsed.message ?? parsed.body;
        if (typeof text === "string") {
          messages.push({
            id: String(parsed.id ?? parsed.message_id ?? `${messages.length}`),
            from: String(parsed.from ?? parsed.sender ?? parsed.instance ?? "unknown"),
            text,
          });
          continue;
        }
      } catch {
        // Fall through to the text handling below.
      }
    }

    // "i_abc123: some text" or plain prose.
    const prefixed = trimmed.match(/^([A-Za-z0-9_:.-]{2,64})\s*[:>]\s*(.+)$/);
    if (prefixed) {
      messages.push({ id: `${messages.length}`, from: prefixed[1], text: prefixed[2] });
    } else {
      messages.push({ id: `${messages.length}`, from: "unknown", text: trimmed });
    }
  }

  return messages;
}

export class ArenaAgent {
  readonly ledger = new CreditLedger();
  readonly #client: SharedNetClient;
  readonly #options: Required<Pick<AgentOptions, "waitSeconds" | "post">> & AgentOptions;
  readonly #handled = new Set<string>();
  #consecutiveFailures = 0;
  #stopped = false;

  constructor(options: AgentOptions = {}) {
    this.#client = options.client ?? new SharedNetClient();
    this.#options = {
      waitSeconds: options.waitSeconds ?? 45,
      post: options.post ?? true,
      ...options,
    };
  }

  stop(): void {
    this.#stopped = true;
  }

  /** Startup diagnostics. Reports honestly; never claims an unverified state. */
  async preflight(): Promise<{ ok: boolean; detail: Record<string, unknown> }> {
    const health = await checkArenaHealth();
    const cli = await this.#client.available();

    const detail = {
      sharedos: health.sharedos,
      services: Object.fromEntries(
        Object.entries(health.services).map(([k, v]) => [k, v.status]),
      ),
      sharednet_cli_installed: cli.installed,
      sharednet_authenticated: cli.authenticated,
      room: this.#options.room ?? IDENTITY.sharednetRoomId ?? null,
      purpose: health.purpose,
      prices: PRICES,
    };

    log("preflight", detail);
    // The services must work. SharedNet presence is reported but does not gate
    // startup: the MCP and HTTP entry points serve agents regardless.
    return { ok: health.status !== "down", detail };
  }

  async join(): Promise<boolean> {
    const room = this.#options.room ?? IDENTITY.sharednetRoomId;
    if (!room) {
      log("join_skipped", { reason: "no room configured (SHAREDNET_ROOM_ID)" });
      return false;
    }
    const result = await this.#client.join(room);
    log("join", { room, ok: result.ok, error: result.ok ? undefined : result.stderr.trim() });
    return result.ok;
  }

  async #reply(text: string): Promise<void> {
    if (!this.#options.post) {
      log("reply_dry_run", { chars: text.length });
      return;
    }
    const result = await this.#client.say(text);
    if (!result.ok) {
      log("reply_failed", { error: result.stderr.trim().slice(0, 300) });
    }
  }

  /**
   * Handles one inbound message. Always resolves — a hostile or malformed
   * message produces a structured reply, never an exception.
   */
  async handleMessage(message: ParsedMessage): Promise<void> {
    const intent = interpret(message.text);

    if (intent.kind === "ignore") return;

    if (intent.kind === "catalog_request") {
      log("catalog_request", { from: message.from });
      await this.#reply(catalogPitch());
      return;
    }

    if (intent.kind === "payment_claim") {
      const { matched } = this.ledger.recordClaim({
        counterparty: message.from,
        amount: intent.amount,
        memo: intent.memo,
        claimedAt: new Date().toISOString(),
      });
      log("payment_claim", {
        from: message.from,
        amount: intent.amount,
        memo: intent.memo,
        matched: matched?.requestId ?? null,
      });
      await this.#reply(
        matched
          ? `Thanks — logged ${intent.amount ?? matched.amountDue} credits against ${matched.requestId} (${matched.service}). Send another decision any time.`
          : `Thanks — credits noted. Quote the request_id in the memo next time and I'll reconcile it automatically.`,
      );
      return;
    }

    await this.#serve(intent.service, intent.payload, message);
  }

  async #serve(
    service: ServiceName,
    payload: Record<string, unknown>,
    message: ParsedMessage,
  ): Promise<void> {
    const started = Date.now();

    // Request-scoped: the caller identity and payload live only in this call.
    const envelope = await invokeService(service, payload, {
      caller: { agentId: `sharednet:${message.from}`, name: message.from },
    });

    log("served", {
      service,
      from: message.from,
      ok: envelope.success,
      ms: Date.now() - started,
      request_id: envelope.request_id,
    });

    if (!envelope.success) {
      await this.#reply(
        [
          `${service} could not run: ${envelope.error.message}`,
          envelope.error.field ? `Field: ${envelope.error.field}` : "",
          "",
          "Send JSON like:",
          service === "verify_claim"
            ? '  {"service":"verify_claim","claim":"..."}'
            : `  {"service":"${service}","thesis":"..."}`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
      return;
    }

    if (envelope.price_credits > 0) {
      this.ledger.recordDelivery({
        requestId: envelope.request_id,
        service,
        counterparty: message.from,
        amountDue: envelope.price_credits,
        deliveredAt: new Date().toISOString(),
      });
    }

    await this.#reply(this.#formatResult(envelope));
  }

  #formatResult(envelope: Extract<
    Awaited<ReturnType<typeof invokeService>>,
    { success: true }
  >): string {
    const result = envelope.result as Record<string, unknown>;
    const lines: string[] = [];

    lines.push(`${envelope.service} → ${String(result.verdict ?? "COMPLETE")}`);
    if (typeof result.score === "number") lines.push(`score ${result.score}/100`);
    if (typeof result.confidence === "number") lines.push(`confidence ${result.confidence}%`);
    if (typeof result.summary === "string") lines.push("", result.summary);
    if (typeof result.recommendation === "string") {
      lines.push("", `Recommendation: ${result.recommendation}`);
    }

    lines.push("", "```json", JSON.stringify(envelope), "```");

    if (envelope.payment) {
      lines.push(
        "",
        `${envelope.payment.amount} credits — memo \`${envelope.payment.memo}\` so I can reconcile it.`,
      );
    }
    return lines.join("\n");
  }

  /** One wait/read/handle cycle. Returns how many messages it handled. */
  async tick(): Promise<number> {
    const waited = await this.#client.wait(this.#options.waitSeconds);
    // A timeout is a normal heartbeat, not a failure.
    if (!waited.ok && !waited.timedOut && waited.code === null) {
      throw new Error(`sharednet unavailable: ${waited.stderr.trim().slice(0, 200)}`);
    }

    const read = await this.#client.read(20);
    if (!read.ok && read.code === null) {
      throw new Error(`sharednet read failed: ${read.stderr.trim().slice(0, 200)}`);
    }

    const messages = parseMessages(read.stdout);
    let handled = 0;

    for (const message of messages) {
      const key = `${message.from}:${message.id}:${message.text.slice(0, 64)}`;
      if (this.#handled.has(key)) continue;
      this.#handled.add(key);

      try {
        await this.handleMessage(message);
        handled += 1;
      } catch (err) {
        // One bad message must never end the Arena presence.
        log("message_error", { from: message.from, error: (err as Error).message });
      }
    }

    // Bound the dedupe set so a long Arena does not grow it without limit.
    if (this.#handled.size > 2_000) {
      const keep = [...this.#handled].slice(-1_000);
      this.#handled.clear();
      for (const k of keep) this.#handled.add(k);
    }

    return handled;
  }

  /** The supervised presence loop. Runs until stopped. */
  async run(): Promise<void> {
    const preflight = await this.preflight();
    if (!preflight.ok) {
      log("preflight_failed", { detail: preflight.detail });
    }
    await this.join();

    log("ready", { waitSeconds: this.#options.waitSeconds, post: this.#options.post });

    let iterations = 0;
    while (!this.#stopped) {
      if (this.#options.maxIterations !== undefined && iterations >= this.#options.maxIterations) {
        break;
      }
      iterations += 1;

      try {
        const handled = await this.tick();
        this.#consecutiveFailures = 0;
        if (handled > 0) log("tick", { handled, ledger: this.ledger.summary() });
      } catch (err) {
        this.#consecutiveFailures += 1;
        const backoff = Math.min(
          BASE_BACKOFF_MS * 2 ** (this.#consecutiveFailures - 1),
          MAX_BACKOFF_MS,
        );
        log("tick_error", {
          error: (err as Error).message,
          consecutiveFailures: this.#consecutiveFailures,
          retryInMs: backoff,
        });
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }

    log("stopped", { ledger: this.ledger.summary() });
  }
}

export async function main(): Promise<void> {
  const agent = new ArenaAgent({
    room: process.env.SHAREDNET_ROOM_ID ?? null,
    post: process.env.ARENA_DRY_RUN !== "true",
  });

  // Keep the process alive through anything a peer agent can send.
  process.on("uncaughtException", (err) => log("uncaught", { error: err.message }));
  process.on("unhandledRejection", (reason) => log("unhandled", { error: String(reason) }));
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      log("signal", { signal });
      agent.stop();
    });
  }

  await agent.run();
}
