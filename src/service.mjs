import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { workflow, deployment, demand, hash, relativePath } from "./schema.mjs";
import { replay } from "./runner.mjs";
export const demoWorkflow = (app, repair = false) => ({
  schema_version: "1",
  id: "export-report",
  application: app,
  title: "Export a report",
  questions: [
    "How do I export a report?",
    "Export report",
    "导出报告",
    "如何导出报告？",
  ],
  role: "admin",
  locale: "en",
  source_paths: ["fixtures/reports.html"],
  shared_paths: ["src/auth/"],
  start_path: "/fixture/",
  steps: [
    ...(repair
      ? [
          {
            id: "more",
            instruction: "Select More.",
            instruction_zh: "选择更多。",
            action: { type: "click", selector: "#more" },
            assertion: { type: "visible", selector: "#export" },
            expected: "Export report is visible.",
            expected_zh: "导出报告按钮可见。",
          },
        ]
      : []),
    {
      id: "export",
      instruction: "Select Export report.",
      instruction_zh: "选择导出报告。",
      action: { type: "click", selector: "#export" },
      assertion: { type: "visible", selector: "#download-ready" },
      expected: "CSV is ready.",
      expected_zh: "CSV 已就绪。",
    },
  ],
  redact_selectors: ["input[type=password]", "[data-private]"],
});
export class Service {
  constructor(store, config) {
    this.store = store;
    this.config = config;
    this.active = null;
    this.stopping = false;
  }
  get data() {
    return this.store.data;
  }
  async start() {
    await this.pruneExpired();
    this.cleanupTimer = setInterval(() => {
      this.pruneExpired().catch((error) => {
        this.cleanupError = error;
      });
    }, 60000);
    this.cleanupTimer.unref();
  }
  pruneExpired() {
    if (this.cleanup) return this.cleanup;
    if (this.stopping) return Promise.resolve();
    this.cleanup = (async () => {
      const now = Date.now();
      const expired = Object.values(this.data.artifacts).filter(
        (artifact) => !(Date.parse(artifact.expires_at) > now),
      );
      // Artifact IDs are immutable and metadata is installed only after writing bytes.
      // Never replace the collections from a snapshot across an asynchronous removal.
      for (const artifact of expired) {
        await fs.rm(path.join(this.store.private, artifact.file), {
          force: true,
        });
        delete this.data.artifacts[artifact.id];
      }
      this.data.publications = this.data.publications.filter((publication) => {
        const run = this.data.runs[publication.run_id];
        return (
          Date.parse(publication.expires_at) > now &&
          run &&
          Date.parse(run.expires_at) > now &&
          run.steps.every(
            (step) =>
              !step.artifact_id ||
              Date.parse(this.data.artifacts[step.artifact_id]?.expires_at) >
                now,
          )
        );
      });
      for (const run of Object.values(this.data.runs)) {
        for (const step of run.steps || []) {
          if (step.artifact_id && !this.data.artifacts[step.artifact_id]) {
            run.evidence_expired = true;
            delete step.artifact_id;
          }
        }
      }
      await this.store.save();
      this.cleanupError = null;
    })().finally(() => {
      this.cleanup = null;
    });
    return this.cleanup;
  }

  enriched(w) {
    const runs = Object.values(this.data.runs)
      .filter((r) => r.workflow_id === w.id)
      .sort((a, b) => b.started_at.localeCompare(a.started_at));
    const last = runs[0] || null;
    let status = "draft";
    if (last) {
      status =
        last.revision !== w.revision ||
        hash(last.deployment) !== hash(this.data.deployment)
          ? "stale"
          : last.status === "passed"
            ? "verified"
            : "failed";
    }
    if (
      Object.values(this.data.questions).some(
        (q) => q.workflow_id === w.id && q.status === "open",
      )
    )
      status = "stale";
    return { ...w, status, last_run: last };
  }
  async put(input) {
    const w = workflow(input, this.config.application);
    this.data.workflows[w.id] = w;
    await fs.mkdir(path.join(this.store.root, "workflows"), {
      recursive: true,
    });
    const target = path.join(this.store.root, "workflows", w.id + ".json");
    await fs.writeFile(target + ".tmp", JSON.stringify(w, null, 2));
    await fs.rename(target + ".tmp", target);
    await this.store.save();
    return this.enriched(w);
  }
  async setDeployment(input) {
    this.data.deployment = deployment(input, this.config.allowedOrigins);
    await this.store.save();
    return this.data.deployment;
  }
  async artifact(buffer, kind = "screenshot") {
    const png = await sharp(buffer, { limitInputPixels: 16000000 })
      .png()
      .toBuffer();
    const id = randomUUID();
    const expires_at = new Date(Date.now() + this.config.ttl).toISOString();
    await fs.writeFile(path.join(this.store.private, id + ".png"), png, {
      mode: 0o600,
    });
    this.data.artifacts[id] = {
      id,
      application: this.config.application,
      kind,
      expires_at,
      sha256: hash(png),
      file: id + ".png",
    };
    await this.store.save();
    return id;
  }
  async enqueue(id) {
    const w = this.data.workflows[id];
    demand(w, "Workflow not found", "not_found", 404);
    demand(this.data.deployment, "Configure a deployment");
    const key = hash([w.revision, this.data.deployment]);
    const existing = Object.values(this.data.jobs).find(
      (j) => j.key === key && ["queued", "running"].includes(j.status),
    );
    if (existing) return existing;
    demand(
      Object.values(this.data.jobs).filter((j) => j.status === "queued")
        .length < 10,
      "Queue full",
      "queue_full",
      429,
    );
    const job = {
      id: randomUUID(),
      workflow_id: id,
      key,
      status: "queued",
      created_at: new Date().toISOString(),
      workflow: structuredClone(w),
      deployment: structuredClone(this.data.deployment),
    };
    this.data.jobs[job.id] = job;
    await this.store.save();
    setImmediate(() => this.pump());
    return job;
  }
  async pump() {
    if (this.active || this.stopping) return;
    const job = Object.values(this.data.jobs).find(
      (j) => j.status === "queued",
    );
    if (!job) return;
    this.active = (async () => {
      job.status = "running";
      await this.store.save();
      let run;
      try {
        run = await replay(job.workflow, job.deployment, {
          artifact: (b) => this.artifact(b),
          stepTimeout: this.config.stepTimeout,
          browserBaseUrl: this.config.browserOrigin || undefined,
        });
      } catch {
        run = {
          workflow_id: job.workflow_id,
          revision: job.workflow.revision,
          deployment: job.deployment,
          status: "failed",
          started_at: new Date().toISOString(),
          finished_at: new Date().toISOString(),
          steps: [],
          error: "Browser could not start",
        };
      }
      run.id = randomUUID();
      run.expires_at = new Date(Date.now() + this.config.ttl).toISOString();
      this.data.runs[run.id] = run;
      job.run_id = run.id;
      job.status = run.status;
      if (run.error) job.error = run.error;
      if (run.status === "failed")
        this.data.publications = this.data.publications.filter(
          (p) =>
            !(
              p.workflow.id === run.workflow_id &&
              p.workflow.revision === run.revision &&
              hash(p.deployment) === hash(run.deployment)
            ),
        );
      delete job.workflow;
      delete job.deployment;
      await this.store.save();
    })().finally(() => {
      this.active = null;
      this.pump();
    });
  }
  async publish(id, runId) {
    const w = this.data.workflows[id],
      r = this.data.runs[runId];
    demand(
      w &&
        r &&
        !r.evidence_expired &&
        r.steps.every(
          (step) =>
            !step.artifact_id ||
            Date.parse(this.data.artifacts[step.artifact_id]?.expires_at) >
              Date.now(),
        ) &&
        r.workflow_id === id &&
        r.status === "passed" &&
        r.revision === w.revision &&
        hash(r.deployment) === hash(this.data.deployment) &&
        Date.parse(r.expires_at) > Date.now(),
      "Successful current unexpired run required",
    );
    demand(
      !Object.values(this.data.questions).some(
        (q) => q.workflow_id === id && q.status === "open",
      ),
      "Resolve workflow questions first",
    );
    const p = {
      id: randomUUID(),
      workflow: structuredClone(w),
      deployment: structuredClone(r.deployment),
      run_id: r.id,
      expires_at: r.expires_at,
      published_at: new Date().toISOString(),
    };
    this.data.publications = this.data.publications.filter(
      (x) =>
        !(
          x.workflow.id === id &&
          x.deployment.version === p.deployment.version &&
          x.deployment.environment === p.deployment.environment
        ),
    );
    this.data.publications.push(p);
    await this.store.save();
    return p;
  }
  async impact(input) {
    demand(
      Array.isArray(input.changed_paths) &&
        input.changed_paths.length <= 10000 &&
        input.changed_paths.every(relativePath) &&
        typeof input.source_revision === "string" &&
        input.source_revision.length > 0,
      "Complete relative changed paths and source revision required",
    );
    const affected = [],
      mapped = new Set(),
      questions = [];
    for (const w of Object.values(this.data.workflows)) {
      const matches = input.changed_paths.filter((p) =>
        [...w.source_paths, ...w.shared_paths].some(
          (s) => p === s || (s.endsWith("/") && p.startsWith(s)),
        ),
      );
      if (!matches.length) continue;
      matches.forEach((p) => mapped.add(p));
      affected.push(w.id);
      let q = Object.values(this.data.questions).find(
        (q) =>
          q.workflow_id === w.id &&
          q.source_revision === input.source_revision &&
          q.revision === w.revision,
      );
      if (!q) {
        q = {
          id: randomUUID(),
          workflow_id: w.id,
          revision: w.revision,
          source_revision: input.source_revision,
          question:
            "Source changed. Review workflow and resolve before publishing.",
          status: "open",
        };
        this.data.questions[q.id] = q;
      }
      questions.push(q);
    }
    await this.store.save();
    return {
      affected,
      unmapped: input.changed_paths.filter((p) => !mapped.has(p)),
      questions,
    };
  }
  query(b) {
    demand(
      b.application === this.config.application,
      "Application mismatch",
      "forbidden",
      403,
    );
    const empty = { steps: [], evidence: [] };
    if (b.image_artifact_id) {
      const a = this.data.artifacts[b.image_artifact_id];
      demand(
        a && Date.parse(a.expires_at) > Date.now(),
        "Image expired or unavailable",
      );
    }
    if (typeof b.question !== "string" || !b.question.trim())
      return {
        ...empty,
        status: "clarification_needed",
        question:
          "Describe the task in words; image recognition is not available.",
      };
    demand(b.question.length <= 2000, "Question too long");
    const norm = (s) => s.toLowerCase().replace(/[\p{P}\p{Z}]/gu, "");
    const candidates = Object.values(this.data.workflows).filter((w) =>
      w.questions.some((q) => norm(q) === norm(b.question)),
    );
    if (candidates.length !== 1)
      return {
        ...empty,
        status: "clarification_needed",
        question: "Which documented task do you want to perform?",
      };
    const id = candidates[0].id,
      d = this.data.deployment;
    const p = [...this.data.publications]
      .reverse()
      .find(
        (p) =>
          p.workflow.id === id &&
          p.deployment.version === (b.deployment_version ?? d?.version) &&
          p.deployment.environment === (b.environment ?? d?.environment),
      );
    const locale = b.context?.locale || "en";
    if (
      !p ||
      !b.context?.role ||
      p.workflow.role !== b.context.role ||
      Date.parse(p.expires_at) <= Date.now() ||
      (!b.deployment_version && hash(p.deployment) !== hash(d)) ||
      (hash(p.deployment) === hash(d) &&
        p.workflow.revision !== candidates[0].revision) ||
      ![p.workflow.locale, "zh", "zh-CN"].includes(locale)
    )
      return {
        ...empty,
        status: "unavailable",
        reason:
          "No current verified publication matches this deployment and context.",
      };
    const zh = locale.startsWith("zh");
    if (zh && p.workflow.steps.some((s) => !s.instruction_zh || !s.expected_zh))
      return {
        ...empty,
        status: "unavailable",
        reason: "Translation unavailable",
      };
    const steps = p.workflow.steps.map((s) => ({
      id: s.id,
      text: zh ? s.instruction_zh : s.instruction,
      expected: zh ? s.expected_zh : s.expected,
    }));
    const run = this.data.runs[p.run_id];
    if (
      !run ||
      run.evidence_expired ||
      !(Date.parse(run.expires_at) > Date.now()) ||
      run.steps.some(
        (step) =>
          step.artifact_id &&
          !(
            Date.parse(this.data.artifacts[step.artifact_id]?.expires_at) >
            Date.now()
          ),
      )
    )
      return {
        ...empty,
        status: "unavailable",
        reason: "Verified evidence expired or unavailable.",
      };
    return {
      status: "answered",
      workflow_id: id,
      steps,
      evidence: run.steps.map((s) => ({
        run_id: run.id,
        ...(s.artifact_id &&
        this.data.artifacts[s.artifact_id] &&
        Date.parse(this.data.artifacts[s.artifact_id].expires_at) > Date.now()
          ? { artifact_id: s.artifact_id }
          : {}),
      })),
      guidance: {
        schema_version: "1",
        execution_mode: "instructions_only",
        allowed_origins: [p.deployment.base_url],
        expires_at: p.expires_at,
        steps,
      },
    };
  }
  async demo(version) {
    if (version) {
      this.data.fixture = version;
    } else if (!this.data.workflows["export-report"])
      await this.put(demoWorkflow(this.config.application));
    if (version || !this.data.deployment)
      await this.setDeployment({
        version: this.data.fixture,
        environment: "local",
        base_url: this.config.origin,
        source_revision: "fixture-" + this.data.fixture,
        identity_path: "/fixture/version",
      });
    await this.store.save();
    return {
      deployment: this.data.deployment,
      workflow: this.enriched(
        this.data.workflows["export-report"] ||
          demoWorkflow(this.config.application),
      ),
    };
  }
  async close() {
    this.stopping = true;
    clearInterval(this.cleanupTimer);
    try {
      const results = await Promise.allSettled([this.active, this.cleanup]);
      const failure = results.find((result) => result.status === "rejected");
      if (failure) throw failure.reason;
    } finally {
      await this.store.close();
    }
  }
}
