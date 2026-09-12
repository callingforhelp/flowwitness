/**
 * Portable InvestigationJob construction shared by every repository adapter.
 *
 * Both the local durable repository and the InsForge adapter must build the
 * exact same job record from the exact same input, so the shape and the
 * canonical `inputHash` used for idempotency live here rather than in either
 * adapter.
 */
import { invalid } from "./errors.mjs";
import {
  DEFAULT_JOB_DEADLINE_MS,
  JOB_KINDS,
  assertMaxAttempts,
  assertRecordInput,
  assertReference,
  assertShortString,
  assertStringArray,
  jobInputHash,
  parseIso,
  toIso,
} from "./records.mjs";

function resolveDeadline(clean, nowMs) {
  if (clean.deadlineMs !== undefined) {
    if (!Number.isFinite(clean.deadlineMs) || clean.deadlineMs <= 0) {
      throw invalid("deadlineMs must be a positive number");
    }
    return toIso(nowMs + Math.trunc(clean.deadlineMs));
  }
  if (clean.deadlineAt !== undefined) {
    const ms = parseIso(clean.deadlineAt, "deadlineAt");
    if (ms <= nowMs) throw invalid("deadlineAt must be in the future");
    return toIso(ms);
  }
  return toIso(nowMs + DEFAULT_JOB_DEADLINE_MS);
}

/**
 * Validate enqueue input and produce the domain half of a job record. Base
 * fields (`id`, `version`, `createdAt`, …) are added by the adapter.
 */
export function buildJobRecord({ input, idempotencyKey, nowMs }) {
  const clean = assertRecordInput(input);
  const kind = clean.kind;
  if (!JOB_KINDS.includes(kind)) {
    throw invalid(`kind must be one of ${JOB_KINDS.join(", ")}`);
  }
  const inputRef = assertReference(clean.inputRef, "inputRef");
  const requiredCapabilities = assertStringArray(
    clean.requiredCapabilities ?? [],
    "requiredCapabilities",
  );
  const maxAttempts = assertMaxAttempts(clean.maxAttempts);
  const deadlineAt = resolveDeadline(clean, nowMs);
  const key = assertShortString(idempotencyKey, "idempotencyKey", 200);
  return {
    kind,
    inputRef,
    requiredCapabilities,
    idempotencyKey: key,
    inputHash: jobInputHash({
      kind,
      inputRef,
      requiredCapabilities,
      maxAttempts,
      deadlineAt: clean.deadlineAt ?? null,
      deadlineMs: clean.deadlineMs ?? DEFAULT_JOB_DEADLINE_MS,
    }),
    status: "queued",
    attempt: 0,
    maxAttempts,
    deadlineAt,
    lease: null,
    cancelRequestedAt: null,
    resultRef: null,
    errorCode: null,
  };
}

/** Public projection of a job record, safe to return from the facade. */
export function publicJob(job) {
  if (job === null || job === undefined) return null;
  return {
    schemaVersion: job.schemaVersion,
    id: job.id,
    application: job.application,
    conversationId: job.conversationId,
    version: job.version,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    kind: job.kind,
    inputRef: job.inputRef,
    requiredCapabilities: job.requiredCapabilities,
    idempotencyKey: job.idempotencyKey,
    status: job.status,
    attempt: job.attempt,
    maxAttempts: job.maxAttempts,
    deadlineAt: job.deadlineAt,
    lease: job.lease,
    cancelRequestedAt: job.cancelRequestedAt,
    resultRef: job.resultRef,
    errorCode: job.errorCode,
  };
}
