/**
 * Shared record, scope, and query primitives for the platform adapters.
 *
 * These rules are the portable half of docs/MODULE-CONTRACT.md: every adapter
 * (local durable, InsForge/Postgres) must apply exactly the same validation,
 * scope isolation, ordering, and cursor semantics so a record written through
 * one adapter reads back identically through the other.
 */
import { createHash } from "node:crypto";
import { invalid } from "./errors.mjs";

export const SCHEMA_VERSION = 1;

/** Collection that holds InvestigationJob records for every job kind. */
export const JOB_COLLECTION = "investigationJobs";

export const JOB_KINDS = Object.freeze([
  "investigation",
  "reproduction",
  "video",
  "maintenance",
]);

export const JOB_STATUSES = Object.freeze([
  "queued",
  "leased",
  "succeeded",
  "failed",
  "cancelled",
]);

export const TERMINAL_JOB_STATUSES = Object.freeze([
  "succeeded",
  "failed",
  "cancelled",
]);

export const DEFAULT_LEASE_MS = 60_000;
export const MAX_LEASE_MS = 120_000;
export const MIN_LEASE_MS = 1_000;
export const DEFAULT_HEARTBEAT_MS = 20_000;
export const DEFAULT_MAX_ATTEMPTS = 3;
export const MAX_MAX_ATTEMPTS = 10;
export const DEFAULT_JOB_DEADLINE_MS = 10 * 60_000;
export const DEFAULT_ARTIFACT_TTL_MS = 24 * 60 * 60_000;
export const DEFAULT_LINK_TTL_MS = 5 * 60_000;

/** Portable collections defined by the module contract. */
export const COLLECTIONS = Object.freeze([
  "issues",
  "messages",
  "knowledgeEntries",
  JOB_COLLECTION,
  "reproductionRequests",
  "evidenceBundles",
  "videoProjects",
  "agentCapabilities",
]);

/** Existing workflow collections reachable through the maintenance adapter. */
export const MAINTENANCE_COLLECTIONS = Object.freeze([
  "workflows",
  "runs",
  "publications",
  "questions",
  "deliveries",
]);

const KNOWN_COLLECTIONS = new Set([...COLLECTIONS, ...MAINTENANCE_COLLECTIONS]);

export const BASE_FIELDS = Object.freeze([
  "schemaVersion",
  "id",
  "application",
  "conversationId",
  "version",
  "createdAt",
  "updatedAt",
]);

/** Fields usable in `query().where` beyond the base fields. */
const DOMAIN_QUERY_FIELDS = Object.freeze({
  issues: ["title", "locale", "status", "createdBy", "resolutionEntryId"],
  messages: ["issueId", "authorId", "authorRole", "locale"],
  knowledgeEntries: ["issueId", "kind", "visibility", "evidenceStatus"],
  investigationJobs: ["kind", "status", "idempotencyKey"],
  reproductionRequests: ["issueId", "jobId", "approvalRef"],
  evidenceBundles: ["jobId", "status", "validatorVersion"],
  videoProjects: ["evidenceBundleId", "locale", "visibility", "jobId"],
  agentCapabilities: ["ownerId", "runtime", "enabled"],
  workflows: ["workflowId", "application", "status"],
  runs: ["workflowId", "status"],
  publications: ["workflowId", "questionId", "status"],
  questions: ["workflowId", "status"],
  deliveries: ["workflowId", "status"],
});

/** Fields searched by `query().text`, case-insensitively. */
export const TEXT_FIELDS = Object.freeze([
  "title",
  "summary",
  "description",
  "text",
]);

/**
 * Domain fields a plain `update()` may never touch. Job, evidence, and
 * publication transitions belong to the atomic operations and to the trusted
 * validator; a caller-asserted transition is a conflict, not an update.
 */
const PROTECTED_DOMAIN_FIELDS = Object.freeze({
  investigationJobs: [
    "kind",
    "inputRef",
    "requiredCapabilities",
    "idempotencyKey",
    "inputHash",
    "status",
    "attempt",
    "maxAttempts",
    "deadlineAt",
    "lease",
    "cancelRequestedAt",
    "resultRef",
    "errorCode",
  ],
  evidenceBundles: ["status", "validatorVersion", "jobId", "target"],
  knowledgeEntries: ["visibility", "evidenceStatus"],
  videoProjects: ["visibility", "outputArtifactId"],
});

export function isKnownCollection(collection) {
  return KNOWN_COLLECTIONS.has(collection);
}

export function assertCollection(collection) {
  if (typeof collection !== "string" || !KNOWN_COLLECTIONS.has(collection)) {
    throw invalid(`Unknown collection: ${String(collection)}`);
  }
  return collection;
}

export function queryFields(collection) {
  assertCollection(collection);
  return new Set([
    ...BASE_FIELDS,
    ...(DOMAIN_QUERY_FIELDS[collection] ?? []),
  ]);
}

export function protectedFields(collection) {
  assertCollection(collection);
  return [...(PROTECTED_DOMAIN_FIELDS[collection] ?? [])];
}

/**
 * Normalize and validate `{application, conversationId}`.
 *
 * A null conversationId means *application scope*, never wildcard access: a
 * null-conversation caller only ever matches null-conversation records.
 */
export function normalizeScope(scope) {
  if (scope === null || typeof scope !== "object" || Array.isArray(scope)) {
    throw invalid("scope must be an object");
  }
  const application = scope.application;
  const conversationId = scope.conversationId ?? null;
  if (
    typeof application !== "string" ||
    application.length === 0 ||
    application.length > 200
  ) {
    throw invalid("scope.application must be a non-empty string");
  }
  if (
    conversationId !== null &&
    (typeof conversationId !== "string" ||
      conversationId.length === 0 ||
      conversationId.length > 200)
  ) {
    throw invalid("scope.conversationId must be null or a non-empty string");
  }
  return { application, conversationId };
}

export const assertScope = normalizeScope;

export function scopeKey(scope) {
  const s = normalizeScope(scope);
  return JSON.stringify([s.application, s.conversationId]);
}

export function sameScope(a, b) {
  return scopeKey(a) === scopeKey(b);
}

export function recordKey(application, id) {
  return `${application}\u0000${id}`;
}

export function toIso(ms) {
  return new Date(ms).toISOString();
}

export function parseIso(value, label = "timestamp") {
  if (typeof value !== "string") throw invalid(`${label} must be an ISO timestamp`);
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw invalid(`${label} must be an ISO timestamp`);
  return ms;
}

/**
 * Deterministic JSON serialization. Rejects anything that is not plain JSON so
 * live objects (sockets, clients, Buffers, class instances) can never leak into
 * a durable record, a hash, or a cursor.
 */
export function canonicalJson(value, seen = new Set()) {
  if (value === null) return "null";
  const type = typeof value;
  if (type === "string") return JSON.stringify(value);
  if (type === "boolean") return value ? "true" : "false";
  if (type === "number") {
    if (!Number.isFinite(value)) throw invalid("Non-finite numbers are not JSON");
    return JSON.stringify(value);
  }
  if (type === "undefined") throw invalid("undefined is not JSON");
  if (type !== "object") throw invalid(`Unsupported value of type ${type}`);
  if (seen.has(value)) throw invalid("Cyclic values are not JSON");
  seen.add(value);
  let out;
  if (Array.isArray(value)) {
    out = `[${value.map((item) => canonicalJson(item, seen)).join(",")}]`;
  } else {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw invalid("Only plain JSON objects are allowed");
    }
    const keys = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort();
    out = `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key], seen)}`)
      .join(",")}}`;
  }
  seen.delete(value);
  return out;
}

/** Deep, detached plain-JSON clone. Throws on non-JSON input. */
export function cloneJson(value) {
  return JSON.parse(canonicalJson(value));
}

export function canonicalHash(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

/**
 * Strip server-managed fields from caller input and validate the rest is plain
 * JSON. `allowId` is set only for `create`.
 */
export function assertRecordInput(record, { allowId = false } = {}) {
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    throw invalid("record must be an object");
  }
  const clone = cloneJson(record);
  for (const field of BASE_FIELDS) {
    if (field === "id" && allowId) continue;
    if (field in clone) {
      throw invalid(`${field} is server-managed and cannot be supplied`);
    }
  }
  return clone;
}

export function assertStringArray(value, label) {
  if (!Array.isArray(value)) throw invalid(`${label} must be an array`);
  const out = value.map((item) => {
    if (typeof item !== "string" || item.length === 0 || item.length > 120) {
      throw invalid(`${label} entries must be non-empty strings`);
    }
    return item;
  });
  return [...new Set(out)];
}

export function assertShortString(value, label, max = 200) {
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    throw invalid(`${label} must be a non-empty string of at most ${max} characters`);
  }
  return value;
}

export function assertReference(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw invalid(`${label} must be an object with collection and id`);
  }
  const { collection, id } = value;
  if (typeof collection !== "string" || !KNOWN_COLLECTIONS.has(collection)) {
    throw invalid(`${label}.collection is not a known collection`);
  }
  if (typeof id !== "string" || id.length === 0 || id.length > 200) {
    throw invalid(`${label}.id must be a non-empty string`);
  }
  return { collection, id };
}

export function clampLeaseMs(value) {
  if (value === undefined || value === null) return DEFAULT_LEASE_MS;
  if (!Number.isFinite(value)) throw invalid("leaseMs must be a number");
  return Math.min(Math.max(Math.trunc(value), MIN_LEASE_MS), MAX_LEASE_MS);
}

export function assertMaxAttempts(value) {
  if (value === undefined || value === null) return DEFAULT_MAX_ATTEMPTS;
  if (!Number.isInteger(value) || value < 1 || value > MAX_MAX_ATTEMPTS) {
    throw invalid(`maxAttempts must be an integer between 1 and ${MAX_MAX_ATTEMPTS}`);
  }
  return value;
}

export function encodeCursor({
  scope,
  collection,
  queryHash,
  createdAt,
  id,
}) {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      s: scopeKey(scope),
      c: collection,
      h: queryHash,
      t: createdAt,
      i: id,
    }),
  ).toString("base64url");
}

export function decodeCursor(cursor) {
  if (typeof cursor !== "string" || cursor.length === 0 || cursor.length > 4096) {
    throw invalid("cursor must be an opaque string");
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw invalid("cursor is malformed");
  }
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    parsed.v !== 1 ||
    typeof parsed.s !== "string" ||
    typeof parsed.c !== "string" ||
    typeof parsed.h !== "string" ||
    typeof parsed.t !== "string" ||
    typeof parsed.i !== "string"
  ) {
    throw invalid("cursor is malformed");
  }
  return {
    scopeKey: parsed.s,
    collection: parsed.c,
    queryHash: parsed.h,
    createdAt: parsed.t,
    id: parsed.i,
  };
}

/** Stable `createdAt,id` ascending order required by the contract. */
export function compareRecords(a, b) {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/**
 * Hash of the filter portion of a query. A cursor is only accepted for the
 * exact scope, collection, and filters that produced it.
 */
export function queryFingerprint(collection, where, text) {
  const entries = Object.entries(where ?? {})
    .map(([key, value]) => [key, value])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return canonicalHash({
    collection,
    where: entries,
    text: typeof text === "string" ? text.trim().toLowerCase() : "",
  });
}

/** Canonical input identity for idempotent enqueue. */
export function jobInputHash(input) {
  return canonicalHash({
    kind: input.kind,
    inputRef: input.inputRef,
    requiredCapabilities: [...input.requiredCapabilities].sort(),
    maxAttempts: input.maxAttempts,
    deadlineAt: input.deadlineAt,
    deadlineMs: input.deadlineMs ?? null,
  });
}

export function jobDedupeKey(scope, kind, idempotencyKey) {
  const s = normalizeScope(scope);
  return canonicalHash({
    application: s.application,
    conversationId: s.conversationId,
    kind,
    idempotencyKey,
  });
}
