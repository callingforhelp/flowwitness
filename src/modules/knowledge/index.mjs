import { randomUUID, createHash } from "node:crypto";
import { demand, Fault } from "./faults.mjs";
import { sanitizeCreate, sanitizeGet, sanitizeSearch, sanitizePublish, sanitizeFeedback } from "./validate.mjs";
import { createEvidenceValidator } from "./evidence.mjs";

export function createModule({ repository, artifacts, jobs, config = {} }) {
  const now = config.now ?? Date.now;
  const transition = (...args) => (repository.transition ?? repository.update).call(repository, ...args);
  const validator = createEvidenceValidator({ repository, artifacts, now });
  const scopeOf = (p) => {
    demand(p?.application && p?.subjectId, "Authentication required", "unauthenticated", 401);
    demand(["operator", "agent", "customer"].includes(p.role), "Access denied", "denied", 403);
    demand(p.role !== "customer" || p.conversationId, "Conversation required", "denied", 403);
    demand(p.conversationId !== undefined || p.role !== "operator", "Select a conversation or explicit null application scope", "denied", 403);
    return { application: p.application, conversationId: p.conversationId ?? null };
  };
  const read = async (scope, collection, id) => {
    demand(repository?.get, "Repository unavailable", "adapter_unavailable", 503);
    const item = await repository.get(scope, collection, id);
    demand(item && item.application === scope.application && (item.conversationId ?? null) === scope.conversationId, "Record not found", "not_found", 404);
    return item;
  };
  const contextual = async (scope, item, context = {}) => {
    let evidenceStatus = await validator.validate(scope, item);
    if ((context.release && item.release !== context.release) || (config.currentRevision && item.release !== config.currentRevision)) evidenceStatus = "stale";
    return { ...item, evidenceStatus, translationMissing: !!context.locale && context.locale !== item.locale };
  };
  const visible = (p, item) => p.role !== "customer" || (item.visibility === "published" && item.evidenceStatus === "verified");
  async function get(p, input) {
    const scope = scopeOf(p), clean = sanitizeGet(input);
    const item = await contextual(scope, await read(scope, "knowledgeEntries", clean.id), clean.context);
    demand(visible(p, item), "Record not found", "not_found", 404);
    return item;
  }
  async function create(p, input) {
    const scope = scopeOf(p);
    demand(p.role !== "customer", "Only builders can create knowledge", "denied", 403);
    const clean = sanitizeCreate(input);
    if (clean.issueId) await read(scope, "issues", clean.issueId);
    if (p.role === "agent") demand(clean.jobId, "Agent findings require a job", "denied", 403);
    if (clean.jobId) {
      const job = await read(scope, "investigationJobs", clean.jobId);
      if (p.role === "agent") demand(job.status === "leased" && job.lease?.ownerId === p.subjectId && Date.parse(job.lease.expiresAt) > Number(now()) && !job.cancelRequestedAt, "Authorized live job required", "denied", 403);
    }
    for (const id of clean.evidenceBundleIds) await read(scope, "evidenceBundles", id);
    for (const id of clean.supersedes) await read(scope, "knowledgeEntries", id);
    const item = { ...clean, id: randomUUID(), visibility: "private", evidenceStatus: "unverified", provenance: { subjectId: p.subjectId, authorRole: p.role, jobId: clean.jobId }, feedback: [] };
    return contextual(scope, await repository.create(scope, "knowledgeEntries", item));
  }
  async function search(p, input = {}) {
    const scope = scopeOf(p), clean = sanitizeSearch(input);
    const binding = createHash("sha256").update(JSON.stringify({ scope, role: p.role, subject: p.subjectId, ...clean, cursor: null })).digest("hex");
    let offset = 0;
    if (clean.cursor) {
      let cursor; try { cursor = JSON.parse(Buffer.from(clean.cursor, "base64url").toString()); } catch { throw new Fault("invalid_request", "Invalid cursor"); }
      demand(cursor.binding === binding && Number.isSafeInteger(cursor.offset) && cursor.offset >= 0, "Cursor does not match search"); offset = cursor.offset;
    }
    const all = []; let cursor = null;
    do {
      const page = await repository.query(scope, "knowledgeEntries", { where: {}, limit: 100, cursor });
      for (const item of page.items) if (item.application === scope.application && (item.conversationId ?? null) === scope.conversationId) {
        const current = await contextual(scope, item, clean.context);
        if (visible(p, current)) all.push(current);
      }
      demand(!page.nextCursor || page.nextCursor !== cursor, "Repository pagination stalled", "adapter_unavailable", 503);
      cursor = page.nextCursor;
    } while (cursor);
    const superseded = new Set(all.filter(x => x.visibility === "published" && x.evidenceStatus === "verified").flatMap(x => x.supersedes ?? []));
    const normalize = x => String(x).normalize("NFKC").toLowerCase();
    const items = all.filter(x => (clean.includeSuperseded || !superseded.has(x.id)) && (!clean.kind || x.kind === clean.kind) && (!clean.visibility || x.visibility === clean.visibility) && (!clean.context.role || x.role === clean.context.role) && (!clean.context.release || x.release === clean.context.release) && (!clean.context.locale || x.locale === clean.context.locale) && clean.tags.every(t => x.tags.includes(t)) && (!clean.text || normalize(`${x.title}\n${x.summary}\n${x.tags.join(" ")}`).includes(normalize(clean.text)))).sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    return { items: items.slice(offset, offset + clean.limit), nextCursor: offset + clean.limit < items.length ? Buffer.from(JSON.stringify({ binding, offset: offset + clean.limit })).toString("base64url") : null };
  }
  async function publish(p, input) {
    const scope = scopeOf(p);
    demand(p.role === "operator", "Only operators publish", "denied", 403);
    const clean = sanitizePublish(input), item = await read(scope, "knowledgeEntries", clean.id);
    const current = await contextual(scope, item);
    demand(current.evidenceStatus === "verified", "Current verified evidence required", "conflict", 409);
    return transition(scope, "knowledgeEntries", item.id, { transition: "publish", expectedVersion: clean.expectedVersion ?? item.version, patch: { visibility: "published", evidenceStatus: "verified", publishedBy: p.subjectId, publishedAt: new Date(now()).toISOString() } });
  }
  async function feedback(p, input) {
    const scope = scopeOf(p), clean = sanitizeFeedback(input), item = await get(p, { id: clean.id });
    demand((item.feedback ?? []).length < 100, "Feedback capacity reached", "quota", 429);
    return repository.update(scope, "knowledgeEntries", item.id, { expectedVersion: clean.expectedVersion ?? item.version, patch: { feedback: [...(item.feedback ?? []), { subjectId: p.subjectId, value: clean.value, note: clean.note, createdAt: new Date(now()).toISOString() }] } });
  }
  async function handle(ctx) {
    if (ctx.path !== "/v1/knowledge" && !ctx.path.startsWith("/v1/knowledge/")) return null;
    const match = /^\/v1\/knowledge\/([^/]+)(?:\/(publish|feedback))?$/.exec(ctx.path);
    if (ctx.path === "/v1/knowledge") {
      if (ctx.method === "POST") return { status: 201, body: { item: await create(ctx.principal, ctx.body) } };
      if (ctx.method === "GET") {
        const q = { ...(ctx.query ?? {}) };
        if (q.limit !== undefined) q.limit = Number(q.limit);
        if (q.tags !== undefined) q.tags = q.tags.split(",");
        if (q.includeSuperseded !== undefined) { demand(["true", "false"].includes(q.includeSuperseded), "Invalid includeSuperseded"); q.includeSuperseded = q.includeSuperseded === "true"; }
        const context = {}; for (const key of ["locale", "release", "role"]) if (q[key] !== undefined) { context[key] = q[key]; delete q[key]; }
        q.context = context;
        return { status: 200, body: await search(ctx.principal, q) };
      }
    } else if (match) {
      const id = decodeURIComponent(match[1]);
      if (!match[2] && ctx.method === "GET") return { status: 200, body: { item: await get(ctx.principal, { id }) } };
      if (match[2] && ctx.method === "POST") return { status: 200, body: { item: await (match[2] === "publish" ? publish : feedback)(ctx.principal, { ...ctx.body, id }) } };
    }
    return { status: 405, body: { error: { code: "method_not_allowed", message: "Method not allowed" }, requestId: ctx.requestId } };
  }
  return { create, get, search, publish, feedback, handle };
}
