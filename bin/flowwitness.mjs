#!/usr/bin/env node
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { workflow } from "../src/schema.mjs";
const [command = "serve", ...args] = process.argv.slice(2);
const application = process.env.FLOWWITNESS_APPLICATION || "demo-reports";
const usage =
  "Commands: serve, init, validate <file>, import <file>, list, impact --base <ref> --head <ref>, verify <id>, query <question>\n  module (alias: api) <METHOD> <PATH> [JSON|@file]\n  issues, knowledge, agents, investigation <id>, reproduction <id>, video <id>\nModule JSON input: maximum 1 MiB; use /v1 module paths. FLOWWITNESS_URL and FLOWWITNESS_TOKEN configure the service.";
const base = process.env.FLOWWITNESS_URL || "http://127.0.0.1:4310";
const moduleCommand = ["module", "api", "issues", "knowledge", "agents", "investigation", "reproduction", "video"].includes(command);
const redact = value => process.env.FLOWWITNESS_TOKEN
  ? value.split(process.env.FLOWWITNESS_TOKEN).join("[REDACTED]") : value;
const moduleRoutes = [
  [/^\/v1\/(issues|knowledge|agents)$/, ["GET", "POST"]],
  [/^\/v1\/(issues|knowledge)\/[^/]+$/, ["GET"]],
  [/^\/v1\/issues\/[^/]+\/(messages|resolve)$/, ["POST"]],
  [/^\/v1\/knowledge\/[^/]+\/(publish|feedback)$/, ["POST"]],
  [/^\/v1\/(investigations|reproductions|videos)$/, ["POST"]],
  [/^\/v1\/investigations\/claim$/, ["POST"]],
  [/^\/v1\/(investigations|reproductions)\/[^/]+$/, ["GET"]],
  [/^\/v1\/investigations\/[^/]+\/(heartbeat|complete|fail|cancel)$/, ["POST"]],
  [/^\/v1\/videos\/[^/]+$/, ["GET", "PATCH"]],
  [/^\/v1\/videos\/[^/]+\/(render|publish)$/, ["POST"]],
];
async function moduleCall(method, route, input) {
  if (!method || !route) throw new Error("Usage: module <METHOD> <PATH> [JSON|@file]");
  method = method.toUpperCase();
  if (route.length > 8192 || !route.startsWith("/v1/") || /[\\#\s]/.test(route))
    throw new Error("Unsupported module path");
  let decoded;
  try { decoded = decodeURIComponent(route.split("?")[0]); }
  catch { throw new Error("Invalid module path encoding"); }
  if (decoded.split("/").some(part => part === "." || part === "..") || /[\\?#\x00-\x20]/.test(decoded) || decoded.split("/").length !== route.split("?")[0].split("/").length)
    throw new Error("Unsupported module path");
  const allowed = moduleRoutes.find(([pattern]) => pattern.test(decoded));
  if (!allowed || !allowed[1].includes(method)) throw new Error("Unsupported module method or path");
  if (method === "GET" && input !== undefined) throw new Error("GET does not accept a JSON body; use query parameters");
  let body;
  if (input !== undefined) {
    const limit = 1024 * 1024;
    let raw = input;
    if (input.startsWith("@")) {
      try {
        const file = await fs.open(input.slice(1), "r");
        try {
          if (!(await file.stat()).isFile()) throw new Error();
          const buffer = Buffer.alloc(limit + 1);
          let size = 0, read;
          do { read = (await file.read(buffer, size, buffer.length - size, null)).bytesRead; size += read; } while (read && size < buffer.length);
          raw = buffer.subarray(0, size).toString("utf8");
        } finally { await file.close(); }
      } catch { throw new Error("Cannot read JSON input file"); }
    }
    if (Buffer.byteLength(raw) > limit) throw new Error("JSON input exceeds 1 MiB");
    try { body = JSON.parse(raw); } catch { throw new Error("Invalid JSON input"); }
  }
  return call(route, method, body);
}
async function call(route, method = "GET", body) {
  const response = await fetch(new URL(route, base), {
    method,
    ...(moduleCommand ? { redirect: "error" } : {}),
    headers: {
      "content-type": "application/json",
      "x-flowwitness-client": "cli",
      ...(process.env.FLOWWITNESS_TOKEN
        ? { authorization: "Bearer " + process.env.FLOWWITNESS_TOKEN }
        : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || "Request failed");
  return result;
}
try {
  let result;
  if (
    ["validate", "import", "verify", "query"].includes(command) &&
    !args.length
  )
    throw new Error("Missing argument. " + usage);
  if (["--help", "-h", "help"].includes(command)) {
    console.log(usage);
  } else if (moduleCommand) {
    if (["module", "api"].includes(command)) {
      if (args.length < 2 || args.length > 3) throw new Error("Usage: module <METHOD> <PATH> [JSON|@file]");
      result = await moduleCall(...args);
    } else {
      const collections = { issues: "issues", knowledge: "knowledge", agents: "agents" };
      const records = { investigation: "investigations", reproduction: "reproductions", video: "videos" };
      if (args.length !== (records[command] ? 1 : 0)) throw new Error("Invalid arguments for " + command);
      result = await moduleCall("GET", "/v1/" + (collections[command] || records[command] + "/" + encodeURIComponent(args[0])));
    }
  } else if (command === "serve") {
    const { startServer } = await import("../src/server.mjs");
    const app = await startServer();
    console.log(
      `FlowWitness listening on ${app.config.origin} (${app.config.adminToken ? "authenticated" : "local trusted-user"} mode)`,
    );
    let stopping = false;
    for (const signal of ["SIGINT", "SIGTERM"])
      process.on(signal, async () => {
        if (stopping) return;
        stopping = true;
        await app.close();
        process.exit(0);
      });
  } else if (command === "validate") {
    result = {
      workflow: workflow(
        JSON.parse(await fs.readFile(args[0], "utf8")),
        application,
      ),
    };
  } else if (command === "import") {
    result = await call(
      "/v1/workflows",
      "POST",
      JSON.parse(await fs.readFile(args[0], "utf8")),
    );
  } else if (command === "init") {
    result = await call("/v1/demo/setup", "POST", {});
  } else if (command === "list") {
    result = await call("/v1/workflows");
  } else if (command === "verify") {
    result = await call(
      `/v1/workflows/${encodeURIComponent(args[0])}/verify`,
      "POST",
      {},
    );
    const deadline = Date.now() + 15 * 60 * 1000;
    while (["queued", "running"].includes(result.job.status)) {
      if (Date.now() > deadline)
        throw new Error(
          "Verification wait timed out; inspect job " + result.job.id,
        );
      await new Promise((r) => setTimeout(r, 250));
      result = await call("/v1/jobs/" + result.job.id);
    }
    if (result.job.status !== "passed") process.exitCode = 1;
  } else if (command === "query") {
    result = await call("/v1/query", "POST", {
      application,
      question: args.join(" "),
      context: {
        role: process.env.FLOWWITNESS_ROLE || "admin",
        locale: process.env.FLOWWITNESS_LOCALE || "en",
      },
    });
  } else if (command === "impact") {
    const baseRef = args[args.indexOf("--base") + 1],
      headRef = args[args.indexOf("--head") + 1];
    if (
      !args.includes("--base") ||
      !args.includes("--head") ||
      !baseRef ||
      !headRef
    )
      throw new Error("Usage: impact --base <ref> --head <ref>");
    const resolve = (ref) =>
      execFileSync(
        "git",
        ["rev-parse", "--verify", "--end-of-options", ref + "^{commit}"],
        { encoding: "utf8" },
      ).trim();
    const before = resolve(baseRef),
      after = resolve(headRef);
    const changed = execFileSync(
      "git",
      ["diff", "--name-only", "-z", before, after, "--"],
      { encoding: "utf8" },
    )
      .split("\0")
      .filter(Boolean);
    result = await call("/v1/impact", "POST", {
      changed_paths: changed,
      source_revision: after,
    });
  } else throw new Error(usage);
  if (result !== undefined) console.log(moduleCommand ? redact(JSON.stringify(result, null, 2)) : JSON.stringify(result, null, 2));
} catch (e) {
  console.error(
    e.message.includes("fetch failed")
      ? "Cannot reach FlowWitness. Start the service or set FLOWWITNESS_URL."
      : moduleCommand ? redact(e.message) : e.message,
  );
  process.exitCode = 1;
}
