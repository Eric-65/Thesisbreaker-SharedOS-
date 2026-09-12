#!/usr/bin/env node
// Environment must be loaded before the app module graph reads process.env.
import "./load-env.mjs";
const { main } = await import("../dist/mcp/server.js");
await main();
