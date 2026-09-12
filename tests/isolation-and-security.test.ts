/**
 * Isolation and security guarantees the Arena submission claims.
 *
 * These assertions exist so the claims in README / docs cannot silently rot.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { checkArenaHealth } from "@/lib/arena/health";
import { invokeService } from "@/lib/services/invoke";
import { manifest } from "@/lib/services/registry";
import { getSharedOsStatus } from "@/lib/sharedos/adapter";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "dist") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

const SRC = join(process.cwd(), "src");

describe("Binance isolation", () => {
  it("the Arena services run with no Binance credentials", async () => {
    const saved = { ...process.env };
    delete process.env.BINANCE_AGENT_TOKEN;
    delete process.env.BINANCE_AGENT_BASE_URL;

    try {
      for (const service of ["free_preview", "verify_claim", "break_thesis"] as const) {
        const envelope = await invokeService(
          service,
          service === "verify_claim"
            ? { claim: "A claim that must verify without Binance credentials." }
            : { thesis: "A decision that must analyse without Binance credentials." },
          { caller: { agentId: "agent_no_binance" }, log: false },
        );
        expect(envelope.success).toBe(true);
      }

      const health = await checkArenaHealth();
      expect(health.sharedos).toBe("active");
      expect(health.status).not.toBe("down");
    } finally {
      process.env = saved;
    }
  });

  it("no Arena execution path imports the Binance module", () => {
    const arenaPaths = [
      join(SRC, "lib", "sharedos"),
      join(SRC, "lib", "services"),
      join(SRC, "lib", "arena"),
      join(SRC, "lib", "decision"),
      join(SRC, "mcp"),
      join(SRC, "cli"),
      join(SRC, "arena"),
    ];

    for (const path of arenaPaths) {
      for (const file of walk(path)) {
        const source = readFileSync(file, "utf8");
        expect(source, `${file} must not import the Binance integration`).not.toMatch(
          /from\s+["'][^"']*binance/i,
        );
      }
    }
  });

  it("the manifest does not advertise Binance as part of the product", () => {
    expect(JSON.stringify(manifest())).not.toMatch(/binance/i);
  });
});

describe("secret hygiene", () => {
  it("status and health never expose credential values", async () => {
    const saved = { ...process.env };
    process.env.SHAREDOS_TENANT_ID = "tenant-secret-value";
    process.env.DATABASE_URL = "postgres://user:hunter2@db.internal:5432/app";
    process.env.BINANCE_AGENT_TOKEN = "binance-secret-token";

    try {
      const health = JSON.stringify(await checkArenaHealth());
      expect(health).not.toContain("hunter2");
      expect(health).not.toContain("binance-secret-token");
      expect(health).not.toContain("db.internal");

      // Status may name WHICH variables are missing, never their values.
      const status = JSON.stringify(await getSharedOsStatus());
      expect(status).not.toContain("hunter2");
      expect(status).not.toContain("binance-secret-token");
    } finally {
      process.env = saved;
    }
  });

  it("no NEXT_PUBLIC_ variable carries a secret", () => {
    for (const file of walk(SRC)) {
      const source = readFileSync(file, "utf8");
      const matches = source.match(/NEXT_PUBLIC_[A-Z0-9_]+/g) ?? [];
      for (const name of matches) {
        expect(name).not.toMatch(/TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL|DATABASE/i);
      }
    }
  });

  it(".env.example contains no filled-in credential", () => {
    const example = readFileSync(join(process.cwd(), ".env.example"), "utf8");
    for (const line of example.split("\n")) {
      const match = line.match(/^([A-Z0-9_]*(TOKEN|SECRET|KEY|PASSWORD|URL|ADDRESS|ID))=(.*)$/);
      if (!match) continue;
      const value = match[3].trim();
      // Only non-sensitive defaults may carry a value.
      if (value.length > 0) {
        expect(["thesisbreaker.verify", "thesisbreaker"]).toContain(value);
      }
    }
  });
});

describe("no execution path bypasses SharedOS", () => {
  it("only the kernel tool handler calls the reasoning pipeline", () => {
    const offenders: string[] = [];

    for (const file of walk(SRC)) {
      if (file.endsWith(join("lib", "sharedos", "kernel.ts"))) continue;
      if (file.includes(join("lib", "decision"))) continue;
      if (file.includes(join("lib", "services", "free_preview.ts"))) continue;

      const source = readFileSync(file, "utf8");
      if (/\brunDecisionPipeline\s*\(|\brunVerifyClaimPipeline\s*\(/.test(source)) {
        offenders.push(file.replace(process.cwd(), ""));
      }
    }

    expect(offenders, "these files reach the pipeline outside the SharedOS turn").toEqual([]);
  });

  it("every service response reports SharedOS execution", async () => {
    for (const service of ["free_preview", "verify_claim", "break_thesis"] as const) {
      const envelope = await invokeService(
        service,
        service === "verify_claim"
          ? { claim: "Every response must declare SharedOS execution." }
          : { thesis: "Every response must declare SharedOS execution." },
        { caller: { agentId: "agent_path_check" }, log: false },
      );
      expect(envelope.execution.sharedos).toBe(true);
      expect(envelope.execution.purpose).toBe("thesisbreaker.verify");
      expect(envelope.execution.trace_id).toBeTruthy();
    }
  });
});
