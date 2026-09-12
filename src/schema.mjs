import { createHash } from "node:crypto";
export class Fault extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
export function demand(ok, message, code = "invalid_request", status = 400) {
  if (!ok) throw new Fault(code, message, status);
}
export const hash = (value) =>
  createHash("sha256")
    .update(
      typeof value === "string" || Buffer.isBuffer(value)
        ? value
        : JSON.stringify(value),
    )
    .digest("hex");
export const relativePath = (value) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 500 &&
  !value.startsWith("/") &&
  !value.includes("\\") &&
  !value.split("/").includes("..") &&
  !value.includes("\0");
const string = (v, n = 1000) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= n;
export function workflow(input, application) {
  demand(input && typeof input === "object", "Workflow must be an object");
  const keys = [
    "schema_version",
    "id",
    "application",
    "title",
    "questions",
    "role",
    "locale",
    "source_paths",
    "shared_paths",
    "start_path",
    "steps",
    "redact_selectors",
  ];
  const w = Object.fromEntries(
    keys.filter((k) => k in input).map((k) => [k, structuredClone(input[k])]),
  );
  demand(
    w.schema_version === "1" && /^[a-z0-9][a-z0-9-]{0,79}$/.test(w.id),
    "Invalid schema or workflow id",
  );
  demand(w.application === application, "Application mismatch");
  for (const k of ["title", "role", "locale"])
    demand(string(w[k], 200), `Missing ${k}`);
  demand(
    Array.isArray(w.questions) &&
      w.questions.length > 0 &&
      w.questions.length <= 30 &&
      w.questions.every((q) => string(q, 500)),
    "Questions required",
  );
  for (const k of ["source_paths", "shared_paths"])
    demand(
      Array.isArray(w[k]) && w[k].length <= 100 && w[k].every(relativePath),
      `Invalid ${k}`,
    );
  demand(w.source_paths.length > 0, "Source metadata required");
  demand(
    typeof w.start_path === "string" &&
      w.start_path.startsWith("/") &&
      !w.start_path.startsWith("//") &&
      !w.start_path.includes("\\"),
    "Start path must be local",
  );
  demand(
    Array.isArray(w.steps) && w.steps.length > 0 && w.steps.length <= 20,
    "Require 1–20 steps",
  );
  const ids = new Set();
  const selector = (s) => string(s, 500);
  for (const s of w.steps) {
    demand(string(s.id, 80) && !ids.has(s.id), "Unique step ids required");
    ids.add(s.id);
    demand(
      string(s.instruction) && string(s.expected),
      "Step metadata required",
    );
    demand(
      s.action &&
        ["click", "fill", "assert"].includes(s.action.type) &&
        selector(s.action.selector),
      "Invalid action",
    );
    if (s.action.type === "fill")
      demand(
        typeof s.action.text === "string" && s.action.text.length <= 1000,
        "Fixed fill text required",
      );
    demand(
      s.assertion && ["visible", "text", "url"].includes(s.assertion.type),
      "Invalid assertion",
    );
    if (s.assertion.type !== "url")
      demand(selector(s.assertion.selector), "Assertion selector required");
    if (s.assertion.type === "text")
      demand(string(s.assertion.text), "Assertion text required");
    if (s.assertion.type === "url")
      demand(
        typeof s.assertion.path === "string" &&
          s.assertion.path.startsWith("/") &&
          !s.assertion.path.startsWith("//"),
        "Relative assertion path required",
      );
  }
  demand(
    Array.isArray(w.redact_selectors) &&
      w.redact_selectors.length <= 30 &&
      w.redact_selectors.every(selector),
    "Redaction selectors required",
  );
  return { ...w, revision: hash(w) };
}
export function deployment(d, origins) {
  demand(
    d &&
      [
        "version",
        "environment",
        "base_url",
        "source_revision",
        "identity_path",
      ].every((k) => string(d[k], 500)),
    "Deployment fields required",
  );
  let u;
  try {
    u = new URL(d.base_url);
  } catch {
    throw new Fault("invalid_request", "Invalid base URL");
  }
  demand(
    origins.includes(u.origin) &&
      u.pathname === "/" &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash,
    "Deployment origin not allowed",
  );
  demand(
    d.identity_path.startsWith("/") &&
      !d.identity_path.startsWith("//") &&
      !d.identity_path.includes("\\"),
    "Invalid identity path",
  );
  return { ...d, base_url: u.origin };
}
