/**
 * SharedNet CLI bridge.
 *
 * The Arena Room is driven by the official `sharednet` CLI. This module shells
 * out to it rather than reimplementing its protocol — there is no invented
 * transport, no invented keepalive API, and no fabricated payment call.
 *
 * Commands used (all from `sharednet --help`):
 *   sharednet whoami
 *   sharednet join <invite|rom_…>
 *   sharednet say <text>
 *   sharednet read [--last <n>]
 *   sharednet wait [--timeout <seconds>]
 *   sharednet balance
 *   sharednet ledger [--last <n>]
 *   sharednet pay <target> <amount> [--memo <text>]
 */

import { spawn } from "node:child_process";

export interface SharedNetResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
}

export interface SharedNetOptions {
  /**
   * How to invoke the CLI. May include leading arguments, so the documented
   * `npx -y sharednet@latest` form works as well as a globally installed
   * `sharednet` binary or a local checkout.
   */
  command?: string;
  timeoutMs?: number;
  /** Seat to act as (`--as i_…`). Required when the directory holds several. */
  seat?: string | null;
}

const DEFAULT_COMMAND = process.env.SHAREDNET_CLI ?? "sharednet";
const DEFAULT_SEAT = (process.env.SHAREDNET_NODE_ID ?? "").trim() || null;

export class SharedNetClient {
  readonly #command: string;
  readonly #prefixArgs: readonly string[];
  readonly #defaultTimeout: number;
  readonly #seat: string | null;

  constructor(options: SharedNetOptions = {}) {
    const [command, ...prefixArgs] = (options.command ?? DEFAULT_COMMAND)
      .trim()
      .split(/\s+/)
      .filter((part) => part.length > 0);
    this.#command = command ?? "sharednet";
    this.#prefixArgs = prefixArgs;
    this.#defaultTimeout = options.timeoutMs ?? 30_000;
    this.#seat = options.seat !== undefined ? options.seat : DEFAULT_SEAT;
  }

  /** Adds `--as <seat>` for the verbs that accept it, when a seat is configured. */
  #withSeat(args: string[]): string[] {
    if (!this.#seat) return args;
    const verb = args[0];
    if (!["say", "read", "wait", "watch", "balance", "pay", "upload"].includes(verb)) return args;
    if (args.includes("--as")) return args;
    return [...args, "--as", this.#seat];
  }

  /** Runs one sharednet subcommand. Never throws — always returns a result. */
  async run(args: string[], timeoutMs?: number): Promise<SharedNetResult> {
    const limit = timeoutMs ?? this.#defaultTimeout;

    return new Promise<SharedNetResult>((resolve) => {
      let settled = false;
      let stdout = "";
      let stderr = "";

      const child = spawn(this.#command, [...this.#prefixArgs, ...this.#withSeat(args)], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill("SIGTERM");
        resolve({ ok: false, stdout, stderr, code: null, timedOut: true });
      }, limit);

      child.stdout?.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
      });

      child.on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ ok: false, stdout, stderr: stderr + String(err), code: null, timedOut: false });
      });

      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ ok: code === 0, stdout, stderr, code, timedOut: false });
      });
    });
  }

  /** True when the CLI is installed and this process is authenticated. */
  async available(): Promise<{ installed: boolean; authenticated: boolean; identity?: string }> {
    const result = await this.run(["whoami"], 10_000);
    if (!result.ok && result.code === null && !result.timedOut) {
      return { installed: false, authenticated: false };
    }
    const identity = result.stdout.trim();
    return {
      installed: true,
      authenticated: result.ok && identity.length > 0,
      ...(identity ? { identity } : {}),
    };
  }

  join(room: string) {
    return this.run(["join", room]);
  }

  say(text: string) {
    return this.run(["say", text], 20_000);
  }

  read(last = 20) {
    return this.run(["read", "--last", String(last)]);
  }

  /** Blocks until a message arrives or the timeout expires. */
  wait(timeoutSeconds: number) {
    return this.run(["wait", "--timeout", String(timeoutSeconds)], (timeoutSeconds + 15) * 1000);
  }

  balance() {
    return this.run(["balance"], 15_000);
  }

  ledger(last = 20) {
    return this.run(["ledger", "--last", String(last)], 15_000);
  }

  /** Pays another agent. Used when ThesisBreaker BUYS a service in round 2. */
  pay(target: string, amount: number, memo?: string) {
    const args = ["pay", target, String(amount)];
    if (memo) args.push("--memo", memo);
    return this.run(args, 30_000);
  }
}
