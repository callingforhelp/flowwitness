#!/usr/bin/env node
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { startServer } from "../src/server.mjs";
import { workflow } from "../src/schema.mjs";
const [command = "serve", ...args] = process.argv.slice(2);
const application = process.env.FLOWWITNESS_APPLICATION || "demo-reports";
const usage =
  "Commands: serve, init, validate <file>, import <file>, list, impact --base <ref> --head <ref>, verify <id>, query <question>";
const base = process.env.FLOWWITNESS_URL || "http://127.0.0.1:4310";
async function call(route, method = "GET", body) {
  const response = await fetch(new URL(route, base), {
    method,
    headers: {
      "content-type": "application/json",
      "x-flowwitness-client": "cli",
      ...(process.env.FLOWWITNESS_TOKEN
        ? { authorization: "Bearer " + process.env.FLOWWITNESS_TOKEN }
        : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
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
  } else if (command === "serve") {
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
  if (result) console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.error(
    e.message.includes("fetch failed")
      ? "Cannot reach FlowWitness. Start the service or set FLOWWITNESS_URL."
      : e.message,
  );
  process.exitCode = 1;
}
