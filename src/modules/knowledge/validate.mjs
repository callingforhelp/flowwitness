// Input validation for the knowledge reasoning bank. All validation is
// deterministic: strict field allowlists, an explicit denylist for
// chain-of-thought / credential-shaped material, and bounded lengths so entries
// stay concise.
import { demand } from "./faults.mjs";

export const KINDS = Object.freeze([
  "report",
  "hypothesis",
  "observation",
  "attempt",
  "resolution",
]);
export const LOCALES = Object.freeze(["en", "zh"]);
export const VISIBILITIES = Object.freeze(["private", "published"]);
export const FEEDBACK_VALUES = Object.freeze([
  "helpful",
  "unhelpful",
  "outdated",
  "wrong",
]);
export const LIMITS = Object.freeze({
  title: 200,
  summary: 4000,
  tag: 40,
  tags: 24,
  refs: 20,
  note: 500,
  feedbackPerEntry: 100,
  identifier: 200,
  release: 200,
  role: 100,
  text: 500,
  limitDefault: 20,
  limitMax: 100,
  searchPage: 100,
  searchMaxPages: 10,
});

// Field names that must never be accepted, even before allowlist checks. The
// bank stores concise conclusions, never hidden chain of thought, raw private
// deliberation, credentials, or browser profiles.
const DENIED_KEYS = new Set([
  "chainofthought",
  "cot",
  "reasoning",
  "reasoningtrace",
  "hiddenreasoning",
  "deliberation",
  "privatedeliberation",
  "draftreasoning",
  "innermonologue",
  "thoughtprocess",
  "scratchpad",
  "privatenotes",
  "credentials",
  "credential",
  "secret",
  "secrets",
  "password",
  "passwords",
  "token",
  "tokens",
  "apikey",
  "apikeys",
  "browserprofile",
  "sessionprofile",
  "cookies",
  "cookie",
]);
export function deniedKey(key) {
  return DENIED_KEYS.has(
    String(key)
      .toLowerCase()
      .replace(/[^a-z]/g, ""),
  );
}
function checkKeys(input, allowed) {
  for (const key of Object.keys(input)) {
    demand(
      !deniedKey(key),
      `Field "${key}" is not accepted: chain-of-thought, credentials and browser profiles are never stored`,
      "restricted_content",
      400,
    );
    demand(allowed.has(key), `Unknown field "${key}"`);
  }
}

const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const bounded = (v, max) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;
const idString = (v) => bounded(v, LIMITS.identifier);

export function sanitizeId(value) {
  demand(idString(value), "A valid id is required");
  return value.trim();
}
function optString(value, max, name) {
  if (value === undefined || value === null) return null;
  demand(bounded(value, max), `Invalid ${name}`);
  return value.trim();
}
function idArray(value, name) {
  if (value === undefined || value === null) return [];
  demand(
    Array.isArray(value) && value.length <= LIMITS.refs && value.every(idString),
    `Invalid ${name}`,
  );
  return [...new Set(value.map((v) => v.trim()))];
}
function optVersion(value) {
  if (value === undefined || value === null) return undefined;
  demand(
    Number.isInteger(value) && value >= 1,
    "expectedVersion must be a positive integer",
  );
  return value;
}

export function sanitizeCreate(input) {
  demand(isObject(input), "Request body must be an object");
  checkKeys(
    input,
    new Set([
      "kind",
      "title",
      "summary",
      "locale",
      "tags",
      "release",
      "role",
      "issueId",
      "jobId",
      "evidenceBundleIds",
      "supersedes",
      "evidenceStatus",
      "visibility",
    ]),
  );
  demand(
    KINDS.includes(input.kind),
    "kind must be report, hypothesis, observation, attempt or resolution",
  );
  demand(bounded(input.title, LIMITS.title), "title is required");
  demand(bounded(input.summary, LIMITS.summary), "summary is required");
  demand(LOCALES.includes(input.locale), "locale must be en or zh");
  if (input.evidenceStatus !== undefined)
    demand(
      input.evidenceStatus === "unverified",
      "Evidence status is computed by the trusted validator; callers cannot assert it",
    );
  if (input.visibility !== undefined)
    demand(
      input.visibility === "private",
      "Entries are created private; publication requires the explicit operator publish operation",
    );
  let tags = [];
  if (input.tags !== undefined) {
    demand(
      Array.isArray(input.tags) &&
        input.tags.length <= LIMITS.tags &&
        input.tags.every((t) => bounded(t, LIMITS.tag)),
      "Invalid tags",
    );
    tags = [...new Set(input.tags.map((t) => t.trim()))];
  }
  return {
    kind: input.kind,
    title: input.title.trim(),
    summary: input.summary.trim(),
    locale: input.locale,
    tags,
    release: optString(input.release, LIMITS.release, "release"),
    role: optString(input.role, LIMITS.role, "role"),
    issueId: optString(input.issueId, LIMITS.identifier, "issueId"),
    jobId: optString(input.jobId, LIMITS.identifier, "jobId"),
    evidenceBundleIds: idArray(input.evidenceBundleIds, "evidenceBundleIds"),
    supersedes: idArray(input.supersedes, "supersedes"),
  };
}

export function sanitizeContext(context) {
  if (context === undefined || context === null) return {};
  demand(isObject(context), "Invalid context");
  checkKeys(context, new Set(["role", "release", "locale"]));
  const out = {};
  const role = optString(context.role, LIMITS.role, "context role");
  const release = optString(context.release, LIMITS.release, "context release");
  if (role) out.role = role;
  if (release) out.release = release;
  if (context.locale !== undefined && context.locale !== null) {
    demand(LOCALES.includes(context.locale), "Invalid context locale");
    out.locale = context.locale;
  }
  return out;
}

export function sanitizeSearch(input = {}) {
  demand(isObject(input), "Search input must be an object");
  checkKeys(
    input,
    new Set([
      "text",
      "kind",
      "tags",
      "visibility",
      "includeSuperseded",
      "limit",
      "cursor",
      "context",
    ]),
  );
  const clean = {
    text: null,
    kind: null,
    tags: [],
    visibility: null,
    includeSuperseded: false,
    limit: LIMITS.limitDefault,
    cursor: null,
    context: sanitizeContext(input.context),
  };
  if (input.text !== undefined && input.text !== null) {
    demand(
      typeof input.text === "string" && input.text.length <= LIMITS.text,
      "Invalid search text",
    );
    clean.text = input.text;
  }
  if (input.kind !== undefined && input.kind !== null) {
    demand(KINDS.includes(input.kind), "Invalid kind");
    clean.kind = input.kind;
  }
  if (input.tags !== undefined && input.tags !== null) {
    demand(
      Array.isArray(input.tags) &&
        input.tags.length <= LIMITS.tags &&
        input.tags.every((t) => bounded(t, LIMITS.tag)),
      "Invalid tags",
    );
    clean.tags = [...new Set(input.tags.map((t) => t.trim()))];
  }
  if (input.visibility !== undefined && input.visibility !== null) {
    demand(VISIBILITIES.includes(input.visibility), "Invalid visibility");
    clean.visibility = input.visibility;
  }
  if (input.includeSuperseded !== undefined) {
    demand(
      typeof input.includeSuperseded === "boolean",
      "includeSuperseded must be a boolean",
    );
    clean.includeSuperseded = input.includeSuperseded;
  }
  if (input.limit !== undefined && input.limit !== null) {
    demand(
      Number.isInteger(input.limit) &&
        input.limit >= 1 &&
        input.limit <= LIMITS.limitMax,
      "limit must be an integer between 1 and 100",
    );
    clean.limit = input.limit;
  }
  if (input.cursor !== undefined && input.cursor !== null) {
    demand(
      typeof input.cursor === "string" && input.cursor.length <= 2000,
      "Invalid cursor",
    );
    clean.cursor = input.cursor;
  }
  return clean;
}

export function sanitizeGet(input) {
  demand(isObject(input), "Get input must be an object");
  checkKeys(input, new Set(["id", "context"]));
  return { id: sanitizeId(input.id), context: sanitizeContext(input.context) };
}

export function sanitizePublish(input) {
  demand(isObject(input), "Request body must be an object");
  checkKeys(input, new Set(["id", "expectedVersion"]));
  return { id: sanitizeId(input.id), expectedVersion: optVersion(input.expectedVersion) };
}

export function sanitizeFeedback(input) {
  demand(isObject(input), "Request body must be an object");
  checkKeys(input, new Set(["id", "value", "note", "expectedVersion"]));
  demand(
    FEEDBACK_VALUES.includes(input.value),
    "value must be helpful, unhelpful, outdated or wrong",
  );
  return {
    id: sanitizeId(input.id),
    value: input.value,
    note: optString(input.note, LIMITS.note, "note"),
    expectedVersion: optVersion(input.expectedVersion),
  };
}
