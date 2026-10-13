#!/usr/bin/env node
/**
 * `npm start`: builds Todoer when it needs building, serves it on this
 * computer only, and opens it in the browser.
 *
 *   npm start                     http://localhost:3101
 *   npm start -- --port 3105      another port, if 3101 is taken
 *   npm start -- --no-open        without opening the browser
 *
 * It builds on the first run and after an update (anything in the app's
 * files changed since the last build), and not otherwise, so starting it
 * again each day takes a second. Already running? It opens the browser on
 * the copy that is running and stops there.
 *
 * Written for a person who has never used a terminal: every way it can stop
 * says what to do next in one sentence, with no stack trace.
 */

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const portArg = args.indexOf("--port");
const PORT = portArg >= 0 ? Number(args[portArg + 1]) : 3101;
const OPEN = !args.includes("--no-open");
const HOST = "127.0.0.1";
/* The address a person uses; the server listens on HOST (src/proxy.ts sends 127.0.0.1 here). */
const URL = `http://localhost:${PORT}`;
const HEALTH = `http://${HOST}:${PORT}/api/health`;
const ROOT = process.cwd();
const NEXT = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
const STAMP = path.join(ROOT, ".next", "todoer-build-stamp");

function stop(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 20 || (major === 20 && minor < 9)) {
  stop(`Todoer needs Node 20.9 or newer, and this computer has ${process.versions.node}. Install the current LTS from nodejs.org, then run npm start again.`);
}
if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65535) stop("The port must be a number from 1024 to 65535.");
if (!existsSync(NEXT)) stop("Todoer's packages are not installed yet. Run npm install in this folder, then npm start.");

/** A fingerprint of everything a build depends on: each file's path, size and time. */
function buildStamp() {
  const hash = createHash("sha256");
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        const info = statSync(full);
        hash.update(`${path.relative(ROOT, full)}|${info.size}|${info.mtimeMs}\n`);
      }
    }
  };
  walk(path.join(ROOT, "src"));
  for (const file of ["package.json", "package-lock.json", "next.config.ts", "postcss.config.mjs", "tsconfig.json"]) {
    const full = path.join(ROOT, file);
    if (existsSync(full)) {
      const info = statSync(full);
      hash.update(`${file}|${info.size}|${info.mtimeMs}\n`);
    }
  }
  return hash.digest("hex");
}

async function answering() {
  try {
    const response = await fetch(HEALTH, { signal: AbortSignal.timeout(1500), redirect: "manual" });
    const body = await response.json();
    return body?.app === "todoer" ? "todoer" : "other";
  } catch {
    return null;
  }
}

function openBrowser() {
  if (!OPEN) return;
  const [command, commandArgs] =
    process.platform === "darwin" ? ["open", [URL]]
    : process.platform === "win32" ? ["cmd", ["/c", "start", "", URL]]
    : ["xdg-open", [URL]];
  spawn(command, commandArgs, { stdio: "ignore", detached: true }).unref();
}

const already = await answering();
if (already === "todoer") {
  console.log(`Todoer is already running at ${URL}.`);
  openBrowser();
  process.exit(0);
}
if (already === "other") {
  stop(`Another program is using port ${PORT}. Close it, or start Todoer on another port: npm start -- --port ${PORT + 4}`);
}

const stamp = buildStamp();
const built = existsSync(path.join(ROOT, ".next", "BUILD_ID")) && existsSync(STAMP) && readFileSync(STAMP, "utf8") === stamp;
if (!built) {
  console.log("Building Todoer. The first time takes a minute or two.\n");
  const env = { ...process.env };
  delete env.PUBLIK_SELF_TEST;
  const result = spawnSync(process.execPath, [NEXT, "build"], { stdio: "inherit", env });
  if (result.status !== 0) stop("The build stopped with an error (above). If you changed nothing, run npm install, then npm start.");
  writeFileSync(STAMP, stamp);
}

const server = spawn(process.execPath, [NEXT, "start", "-H", HOST, "-p", String(PORT)], { stdio: ["ignore", "pipe", "inherit"] });
server.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  if (/error/i.test(text)) process.stdout.write(text);
});
server.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));

for (let tries = 0; tries < 60; tries += 1) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  if ((await answering()) === "todoer") {
    console.log(`\nTodoer is running at ${URL}\nKeep this window open: closing it stops Todoer.\n`);
    openBrowser();
    break;
  }
}
