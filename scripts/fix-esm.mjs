#!/usr/bin/env node
/**
 * tsc emits extensionless relative imports, which Node's ESM resolver rejects.
 * Rewrite them to explicit paths so `dist/` runs under plain Node with no
 * runtime transpiler — one less thing to fail mid-Arena.
 */
import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const DIST = resolve("dist");

async function* walk(dir) {
  for (const entry of await readdir(dir)) {
    const full = join(dir, entry);
    if ((await stat(full)).isDirectory()) yield* walk(full);
    else if (full.endsWith(".js")) yield full;
  }
}

function resolveSpecifier(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec);
  if (existsSync(`${base}.js`)) return `${spec}.js`;
  if (existsSync(join(base, "index.js"))) return `${spec}/index.js`;
  return null;
}

let patched = 0;
for await (const file of walk(DIST)) {
  const source = await readFile(file, "utf8");
  const next = source.replace(
    /(from\s+|import\s*\()(["'])(\.\.?\/[^"']*?)\2/g,
    (match, head, quote, spec) => {
      if (/\.(js|json|mjs|cjs)$/.test(spec)) return match;
      const fixed = resolveSpecifier(file, spec);
      return fixed ? `${head}${quote}${fixed}${quote}` : match;
    },
  );
  if (next !== source) {
    await writeFile(file, next);
    patched += 1;
  }
}

await writeFile(join(DIST, "package.json"), JSON.stringify({ type: "module" }, null, 2));
console.log(`[fix-esm] patched ${patched} file(s)`);
