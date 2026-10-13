#!/usr/bin/env node
/**
 * What a new user's computer does first, end to end: `npm start` on a copy
 * connected to nothing, then the checks that it answers, asks for setup,
 * moves 127.0.0.1 to localhost, refuses another site's write, and has no
 * secret in what it sends the browser. Runs in CI on macOS, Windows and
 * Linux (.github/workflows/ci.yml), and here with `node scripts/smoke.mjs`.
 */

import { spawn } from "node:child_process";
import http from "node:http";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT = 3191;
const dataDir = mkdtempSync(path.join(os.tmpdir(), "todoer-smoke-"));
const failures = [];
let passed = 0;
const check = (name, ok, detail = "") => {
  if (ok) passed += 1;
  else failures.push(`${name}${detail ? `: ${detail}` : ""}`);
};

const server = spawn(process.execPath, ["scripts/start.mjs", "--port", String(PORT), "--no-open"], {
  env: { ...process.env, TODOER_DATA_DIR: dataDir, NEXT_PUBLIC_SUPABASE_URL: "", SUPABASE_SECRET_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
server.stdout.on("data", (chunk) => { output += chunk; });
server.stderr.on("data", (chunk) => { output += chunk; });

function finish(code) {
  server.kill();
  rmSync(dataDir, { recursive: true, force: true });
  process.exit(code);
}

const started = Date.now();
while (!output.includes("Todoer is running")) {
  if (server.exitCode !== null || Date.now() - started > 300_000) {
    console.error(output);
    console.error("smoke: Todoer did not start.");
    finish(1);
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}

const base = `http://127.0.0.1:${PORT}`;
const health = await fetch(`${base}/api/health`).then((r) => r.json()).catch(() => null);
check("it says it is Todoer", health?.app === "todoer");

const status = await fetch(`${base}/api/selfhost/status`).then((r) => r.json()).catch(() => null);
check("a fresh copy asks to be connected", status?.configured === false, JSON.stringify(status));

const moved = await fetch(`${base}/tasks?x=1`).then((r) => r.text()).catch(() => "");
check("a page on 127.0.0.1 moves to localhost", moved.includes(`location.replace("http://localhost:${PORT}/tasks?x=1")`));

const page = await fetch(`http://localhost:${PORT}/tasks`, { redirect: "manual" }).catch(() => null);
check("localhost serves the app", page?.status === 200, String(page?.status));
const html = page ? await page.text() : "";
check("the page carries no secret key", !html.includes("sb_secret_"));

const write = await fetch(`http://localhost:${PORT}/api/selfhost/connect`, {
  method: "POST",
  headers: { origin: "https://attacker.example", "content-type": "text/plain" },
  body: "{}",
}).catch(() => null);
check("another site's write is refused", write?.status === 403, String(write?.status));

// fetch drops a Host header it is given, so this one is sent by hand.
const foreign = await new Promise((resolve) => {
  http.get({ host: "127.0.0.1", port: PORT, path: "/tasks", headers: { host: `attacker.example:${PORT}` } }, (response) => {
    response.resume();
    resolve(response.statusCode);
  }).on("error", () => resolve(null));
});
check("a foreign Host (DNS rebinding) is refused", foreign === 421, String(foreign));

let leaked = false;
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(js|css|html|json)$/.test(entry) && /sb_secret_[A-Za-z0-9_-]{16,}/.test(readFileSync(full, "utf8"))) leaked = true;
  }
};
walk(path.join(".next", "static"));
check("the built browser files carry no secret key", !leaked);

if (failures.length > 0) {
  console.error(failures.join("\n"));
  console.error(`smoke: ${failures.length} failed, ${passed} passed`);
  finish(1);
}
console.log(`smoke: ${passed} passed`);
finish(0);
