// FlowWitness Video Studio module.
//
// Implements the video row of docs/MODULE-CONTRACT.md: VideoProject records,
// create/get/update/render/publish plus the runRender worker companion, and
// HTTP ownership of /v1/videos. The module is composed with injected
// repository/artifacts/jobs/config and an optional renderer adapter
// (src/adapters/ffmpeg). Importing this file performs no I/O.
//
// Timeline model (docs/VIDEO.md): trim selects a source-timeline window,
// segments pick ordered sub-windows inside trim that are concatenated in
// array order, and captions/highlights are timed on the rendered output
// timeline (0 = first rendered frame). All media crosses the module boundary
// as opaque artifact IDs; bytes are handled only by the injected artifacts
// service and the renderer adapter.

import {
  DEFAULT_LIMITS,
  LOCALES,
  VideoFault,
  demand,
  editHash,
  isArtifactRef,
  isOpaqueId,
  mergeEdit,
  normalizeEdit,
  preflightTiming,
  resolveTiming,
} from "./edit.mjs";

const COLLECTION = "videoProjects";
const BUNDLES = "evidenceBundles";
const JOB_KIND = "video";
const RENDER_CAPABILITY = "ffmpeg";

const ACTIVE_JOB_STATUSES = ["queued", "leased"];
const TERMINAL_JOB_STATUSES = ["succeeded", "failed", "cancelled"];

export function createModule({ repository, artifacts, jobs, config = {}, renderer }) {
  demand(repository, "video module requires a repository adapter", "adapter_unavailable", 503);
  demand(artifacts, "video module requires an artifacts adapter", "adapter_unavailable", 503);
  demand(jobs, "video module requires a jobs adapter", "adapter_unavailable", 503);

  const now = typeof config.now === "function" ? config.now : () => Date.now();
  const limits = {
    ...DEFAULT_LIMITS,
    ...(config.maxOutputMs ? { maxOutputMs: config.maxOutputMs } : {}),
    ...(config.maxCaptions ? { maxCaptions: config.maxCaptions } : {}),
    ...(config.maxSegments ? { maxSegments: config.maxSegments } : {}),
    ...(config.maxHighlights ? { maxHighlights: config.maxHighlights } : {}),
  };
  const linkExpiresInMs = config.linkExpiresInMs ?? 60 * 60 * 1000;
  const heartbeatMs = config.heartbeatMs ?? 20_000;
  const renderTimeoutMs = config.renderTimeoutMs ?? 120_000;
  const newId =
    typeof config.idGenerator === "function"
      ? config.idGenerator
      : (prefix) => `${prefix}_${crypto.randomUUID()}`;

  // ---- principal, scope, and role helpers ---------------------------------

  function requirePrincipal(principal) {
    demand(
      principal &&
        typeof principal === "object" &&
        typeof principal.application === "string" &&
        typeof principal.subjectId === "string" &&
        ["operator", "agent", "customer"].includes(principal.role),
      "A trusted principal is required",
      "unauthenticated",
      401,
    );
    return principal;
  }

  // Operators and agents act at application scope unless the coordinator set
  // an explicit conversation selection; customers are always bound to their
  // conversation.
  function scopeOf(principal) {
    const conversationId = principal.conversationId ?? null;
    if (principal.role === "customer") {
      demand(
        typeof conversationId === "string" && conversationId.length > 0,
        "Customer requests require a conversation binding",
        "forbidden",
        403,
      );
    }
    return { application: principal.application, conversationId };
  }

  function requireRole(principal, roles) {
    demand(
      roles.includes(principal.role),
      `Role ${principal.role} may not perform this action`,
      "forbidden",
      403,
    );
  }

  // ---- record helpers ------------------------------------------------------

  async function loadProject(scope, id) {
    demand(isOpaqueId(id), "Invalid video project id");
    const record = await repository.get(scope, COLLECTION, id);
    demand(record, "Video project not found", "not_found", 404);
    return record;
  }

  // Live evidence status is computed, never stored from caller input:
  // imported recordings stay unverified forever; evidence-backed projects
  // mirror the bundle and expire with it.
  async function evidenceStatusOf(scope, record) {
    if (record.provenance === "imported") return "unverified";
    const bundle = await repository.get(scope, BUNDLES, record.evidenceBundleId);
    if (!bundle) return "failed";
    if (bundle.expiresAt && Date.parse(bundle.expiresAt) <= now()) return "expired";
    return bundle.status;
  }

  async function present(scope, record) {
    return { ...record, evidenceStatus: await evidenceStatusOf(scope, record) };
  }

  function assertNoCallerStatus(input) {
    demand(
      !("evidenceStatus" in input) && !("status" in input),
      "Evidence status is computed by the trusted validator; caller-asserted status is rejected",
    );
  }

  // Resolve the source recording artifact for a project and enforce the
  // evidence gates shared by render and publish.
  async function resolveEvidence(scope, record) {
    if (record.provenance === "imported") {
      const meta = await artifacts.get(scope, record.sourceArtifactId);
      demand(meta, "Source recording artifact is missing", "evidence_ineligible", 409);
      assertArtifactUsable(meta, "Source recording");
      return { bundle: null, sourceArtifactId: record.sourceArtifactId, sourceMeta: meta };
    }
    const bundle = await repository.get(scope, BUNDLES, record.evidenceBundleId);
    demand(bundle, "Evidence bundle is missing", "evidence_ineligible", 409);
    demand(
      bundle.status === "verified",
      `Evidence bundle is ${bundle.status}; rendering and publication consume verified evidence only`,
      "evidence_ineligible",
      409,
    );
    demand(
      !bundle.expiresAt || Date.parse(bundle.expiresAt) > now(),
      "Evidence bundle has expired",
      "evidence_ineligible",
      409,
    );
    let sourceMeta = null;
    for (const artifactId of bundle.artifactIds ?? []) {
      const meta = await artifacts.get(scope, artifactId);
      if (meta && (meta.kind === "recording" || meta.mediaType?.startsWith("video/"))) {
        sourceMeta = meta;
        break;
      }
    }
    demand(sourceMeta, "Evidence bundle contains no recording artifact", "evidence_ineligible", 409);
    assertArtifactUsable(sourceMeta, "Source recording");
    return { bundle, sourceArtifactId: sourceMeta.id, sourceMeta };
  }

  function assertArtifactUsable(meta, label) {
    demand(!meta.revokedAt, `${label} artifact has been revoked`, "evidence_ineligible", 409);
    demand(
      !meta.expiresAt || Date.parse(meta.expiresAt) > now(),
      `${label} artifact has expired`,
      "evidence_ineligible",
      409,
    );
  }

  async function resolveOptionalArtifact(scope, ref, mediaPrefix, label) {
    if (!ref) return null;
    const meta = await artifacts.get(scope, ref);
    demand(meta, `${label} artifact not found`, "invalid_request", 400);
    demand(
      typeof meta.mediaType === "string" && meta.mediaType.startsWith(mediaPrefix),
      `${label} artifact must be ${mediaPrefix}* media`,
      "invalid_request",
      400,
    );
    assertArtifactUsable(meta, label);
    return meta;
  }

  function requireRenderer() {
    demand(
      renderer && typeof renderer.render === "function" && typeof renderer.probe === "function",
      "No renderer adapter is configured for this deployment",
      "adapter_unavailable",
      503,
    );
    return renderer;
  }

  // Build the exact render plan handed to the renderer adapter. Probing the
  // source here makes invalid time bounds fail at submission time; runRender
  // rebuilds the plan before encoding.
  async function buildPlan(scope, record, jobId = null) {
    const source = await resolveEvidence(scope, record);
    const logo = await resolveOptionalArtifact(scope, record.edit.logoArtifactId, "image/", "Logo");
    const narration = await resolveOptionalArtifact(
      scope,
      record.edit.narrationArtifactId,
      "audio/",
      "Narration",
    );
    const probe = await requireRenderer().probe(scope, { id: source.sourceArtifactId });
    demand(
      probe && Number.isFinite(probe.durationMs) && probe.durationMs > 0,
      "Could not measure the source recording duration",
      "adapter_unavailable",
      503,
    );
    const sourceDurationMs = Math.floor(probe.durationMs);
    const timing = resolveTiming(record.edit, sourceDurationMs, limits);
    return {
      jobId,
      source: { artifactId: source.sourceArtifactId },
      logo: logo ? { artifactId: logo.id } : null,
      narration: narration ? { artifactId: narration.id } : null,
      trim: timing.trim,
      segments: timing.segments,
      outputDurationMs: timing.outputDurationMs,
      captions: record.edit.captions,
      colors: record.edit.colors,
      highlights: record.edit.highlights,
      locale: record.locale,
      editHash: editHash(record.locale, record.edit),
      sourceDurationMs,
    };
  }

  // ---- public methods --------------------------------------------------------

  async function create(principal, input = {}) {
    requirePrincipal(principal);
    requireRole(principal, ["operator"]);
    const scope = scopeOf(principal);
    assertNoCallerStatus(input);
    const hasBundle = typeof input.evidenceBundleId === "string" && input.evidenceBundleId.length > 0;
    const hasImport = typeof input.sourceArtifactId === "string" && input.sourceArtifactId.length > 0;
    demand(
      hasBundle !== hasImport,
      "Exactly one of evidenceBundleId (verified recording) or sourceArtifactId (imported recording) is required",
    );
    demand(LOCALES.includes(input.locale), 'locale must be "en" or "zh"');
    const edit = normalizeEdit(input.edit, { limits });
    preflightTiming(edit, limits);

    let provenance;
    let evidenceBundleId = null;
    let sourceArtifactId = null;
    if (hasBundle) {
      demand(isOpaqueId(input.evidenceBundleId), "Invalid evidenceBundleId");
      const bundle = await repository.get(scope, BUNDLES, input.evidenceBundleId);
      demand(bundle, "Evidence bundle not found", "not_found", 404);
      provenance = "evidence";
      evidenceBundleId = bundle.id;
    } else {
      demand(
        isArtifactRef(input.sourceArtifactId),
        "sourceArtifactId must be an opaque artifact ID, never a path or URL",
        "artifact_ref_invalid",
      );
      const meta = await artifacts.get(scope, input.sourceArtifactId);
      demand(meta, "Source recording artifact not found", "not_found", 404);
      demand(
        typeof meta.mediaType === "string" && meta.mediaType.startsWith("video/"),
        "sourceArtifactId must reference video/* media",
      );
      provenance = "imported";
      sourceArtifactId = meta.id;
    }

    const record = await repository.create(scope, COLLECTION, {
      id: newId("vid"),
      evidenceBundleId,
      sourceArtifactId,
      provenance,
      locale: input.locale,
      edit,
      jobId: null,
      outputArtifactId: null,
      outputEditHash: null,
      renderedAt: null,
      visibility: "private",
      publication: null,
    });
    return { item: await present(scope, record) };
  }

  async function get(principal, input = {}) {
    requirePrincipal(principal);
    const scope = scopeOf(principal);
    requireRole(principal, ["operator", "customer"]);
    const record = await loadProject(scope, input.id);
    if (principal.role === "customer") {
      const bound =
        record.visibility === "published" &&
        (record.conversationId === null || record.conversationId === scope.conversationId);
      demand(bound, "Video project not found", "not_found", 404);
      await resolveEvidence(scope, record);
      demand(record.outputEditHash === editHash(record.locale, record.edit), "Output is stale", "stale_output", 409);
      const output = await artifacts.get(scope, record.outputArtifactId);
      demand(output, "Output missing", "not_found", 404);
      assertArtifactUsable(output, "Output");
    }
    return { item: await present(scope, record) };
  }

  const transition = (...args) => (repository.transition ?? repository.update).call(repository, ...args);

  async function update(principal, input = {}) {
    requirePrincipal(principal);
    requireRole(principal, ["operator"]);
    const scope = scopeOf(principal);
    assertNoCallerStatus(input);
    const record = await loadProject(scope, input.id);
    demand(
      Number.isInteger(input.expectedVersion) && input.expectedVersion >= 1,
      "expectedVersion is required for updates",
    );
    for (const frozen of [
      "evidenceBundleId",
      "sourceArtifactId",
      "provenance",
      "jobId",
      "outputArtifactId",
      "outputEditHash",
      "renderedAt",
      "visibility",
      "publication",
    ]) {
      demand(!(frozen in input), `${frozen} cannot be changed by update`);
    }
    const patch = {};
    if (input.locale !== undefined) {
      demand(LOCALES.includes(input.locale), 'locale must be "en" or "zh"');
      patch.locale = input.locale;
    }
    if (input.edit !== undefined) {
      patch.edit = mergeEdit(record.edit, input.edit, { limits });
      preflightTiming(patch.edit, limits);
    }
    demand(Object.keys(patch).length > 0, "Nothing to update");
    if (record.outputArtifactId) await artifacts.revoke(scope, record.outputArtifactId);
    Object.assign(patch, { visibility: "private", publication: null, outputArtifactId: null, outputEditHash: null });
    const next = await transition(scope, COLLECTION, record.id, {
      transition: "private-output",
      expectedVersion: input.expectedVersion,
      patch,
    });
    return { item: await present(scope, next) };
  }

  async function render(principal, input = {}) {
    requirePrincipal(principal);
    requireRole(principal, ["operator"]);
    const scope = scopeOf(principal);
    const record = await loadProject(scope, input.id);
    demand(
      typeof input.idempotencyKey === "string" &&
        input.idempotencyKey.length >= 8 &&
        input.idempotencyKey.length <= 200,
      "render requires an idempotencyKey of 8..200 characters",
      "idempotency_key_required",
    );
    // Validate evidence and every time bound against the probed source before
    // accepting the job: invalid bounds fail the request, not just the job.
    await buildPlan(scope, record);

    if (record.jobId) {
      const previous = await jobs.get(principal, { id: record.jobId }).catch(() => null);
      if (previous && ACTIVE_JOB_STATUSES.includes(previous.status)) {
        if (previous.idempotencyKey === input.idempotencyKey) {
          return { job: previous, item: await present(scope, record) };
        }
        throw new VideoFault(
          "render_in_progress",
          `Render job ${previous.id} is still ${previous.status}`,
          409,
        );
      }
    }

    const job = await jobs.enqueue(principal, {
      kind: JOB_KIND,
      inputRef: { collection: COLLECTION, id: record.id },
      requiredCapabilities: [RENDER_CAPABILITY],
      idempotencyKey: input.idempotencyKey,
    });
    const next = await repository.update(scope, COLLECTION, record.id, {
      expectedVersion: record.version,
      patch: { jobId: job.id },
    });
    return { job, item: await present(scope, next) };
  }

  async function publish(principal, input = {}) {
    requirePrincipal(principal);
    requireRole(principal, ["operator"]);
    const scope = scopeOf(principal);
    const record = await loadProject(scope, input.id);
    demand(
      record.provenance !== "imported",
      "Imported recordings are unverified and can never be published as verified guidance",
      "unverified_provenance",
      409,
    );
    // Current, validated, unexpired, unrevoked evidence is re-checked on every
    // publication call; rendering earlier never implies eligibility now.
    await resolveEvidence(scope, record);
    demand(record.outputArtifactId, "Render the project before publishing", "no_output", 409);
    demand(
      record.outputEditHash === editHash(record.locale, record.edit),
      "The rendered output is stale: the edit changed after rendering",
      "stale_output",
      409,
    );
    const output = await artifacts.get(scope, record.outputArtifactId);
    demand(output, "Rendered output artifact is missing", "no_output", 409);
    assertArtifactUsable(output, "Rendered output");

    let next = record;
    if (record.visibility !== "published") {
      next = await transition(scope, COLLECTION, record.id, {
        transition: "publish",
        expectedVersion: record.version,
        patch: {
          visibility: "published",
          publication: { publishedAt: new Date(now()).toISOString(), publishedBy: principal.subjectId },
        },
      });
    }
    const link = await artifacts.link(scope, next.outputArtifactId, { expiresInMs: linkExpiresInMs });
    return { item: await present(scope, next), link };
  }

  // Worker companion: executes a claimed video job with the injected renderer
  // and settles it. The caller must hold the lease (fencing token); heartbeats
  // keep the lease alive and abort the encode as soon as cancellation or
  // lease loss is observed. Late uploads are rejected by artifacts.put because
  // the lease token no longer validates.
  async function runRender(principal, input = {}) {
    requirePrincipal(principal);
    requireRole(principal, ["operator", "agent"]);
    const scope = scopeOf(principal);
    demand(isOpaqueId(input.id), "A job id is required");
    demand(isOpaqueId(input.token), "A lease token is required");
    const job = await jobs.get(principal, { id: input.id });
    demand(job, "Render job not found", "not_found", 404);
    demand(
      job.kind === JOB_KIND && job.inputRef?.collection === COLLECTION,
      "Job is not a video render job",
    );
    // Validates the live lease up front and throws on a stale token.
    await jobs.heartbeat(principal, { id: job.id, token: input.token });
    const record = await repository.get(scope, COLLECTION, job.inputRef.id);
    demand(record, "Video project not found", "not_found", 404);

    const controller = new AbortController();
    const heartbeat = setInterval(() => {
      jobs
        .heartbeat(principal, { id: job.id, token: input.token })
        .catch((error) => controller.abort(error));
    }, heartbeatMs);
    heartbeat.unref?.();

    let output;
    try {
      const plan = await buildPlan(scope, record, job.id);
      const result = await requireRenderer().render(plan, {
        scope,
        signal: controller.signal,
        timeoutMs: renderTimeoutMs,
      });
      clearInterval(heartbeat);
      controller.signal.throwIfAborted();
      await jobs.heartbeat(principal, { id: job.id, token: input.token });
      output = await artifacts.put(scope, {
        jobId: job.id,
        leaseToken: input.token,
        kind: "video",
        mediaType: result.mediaType ?? "video/mp4",
        bytes: result.bytes,
      });
      const next = await transition(scope, COLLECTION, record.id, {
        transition: "private-output",
        expectedVersion: record.version,
        patch: {
          outputArtifactId: output.id,
          outputEditHash: plan.editHash,
          renderedAt: new Date(now()).toISOString(),
          visibility: "private",
          publication: null,
        },
      });
      const settled = await jobs.complete(principal, {
        id: job.id,
        token: input.token,
        resultRef: { collection: "artifacts", id: output.id },
      });
      return { job: settled, item: await present(scope, next), output };
    } catch (error) {
      clearInterval(heartbeat);
      controller.abort(error);
      // A failed attachment or settlement must never leave usable output.
      if (output) await artifacts.revoke(scope, output.id);
      if (error?.code === "cancelled") {
        // The job was cancelled underneath the render; cancellation wins and
        // there is nothing to settle. Late results were already rejected.
        throw error;
      }
      try {
        await jobs.fail(principal, {
          id: job.id,
          token: input.token,
          errorCode: error?.code ?? "render_failed",
        });
      } catch {
        // Lease already lost or job already terminal (e.g. cancelled): the
        // terminal state stands; surface the original failure.
      }
      throw error;
    }
  }

  // ---- HTTP ownership --------------------------------------------------------

  const ROUTE = /^\/v1\/videos(?:\/([^/]+)(?:\/(render|publish))?)?$/;

  async function handle(requestContext) {
    const { method, path, body = {}, principal, requestId } = requestContext ?? {};
    const match = typeof path === "string" ? path.match(ROUTE) : null;
    if (!match) return null;
    const [, id, action] = match;
    try {
      if (!id) {
        if (method === "POST") return { status: 201, body: await create(principal, body) };
        return { status: 405, body: methodNotAllowed(requestId) };
      }
      if (!action) {
        if (method === "GET") return { status: 200, body: await get(principal, { ...body, id }) };
        if (method === "PATCH") return { status: 200, body: await update(principal, { ...body, id }) };
        return { status: 405, body: methodNotAllowed(requestId) };
      }
      if (method !== "POST") return { status: 405, body: methodNotAllowed(requestId) };
      if (action === "render") return { status: 202, body: await render(principal, { ...body, id }) };
      return { status: 200, body: await publish(principal, { ...body, id }) };
    } catch (error) {
      const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 600 ? error.status : 500;
      const code = typeof error?.code === "string" ? error.code : "internal";
      const message = status === 500 ? "Internal video module error" : error.message;
      return { status, body: { error: { code, message }, requestId } };
    }
  }

  function methodNotAllowed(requestId) {
    return { error: { code: "method_not_allowed", message: "Method not allowed on this path" }, requestId };
  }

  return { create, get, update, render, publish, runRender, handle };
}

export { VideoFault };
