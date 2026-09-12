import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { fixture } from "./helpers.mjs";
import { startServer } from "../src/server.mjs";
import { demoWorkflow } from "../src/service.mjs";
import { Store } from "../src/store.mjs";

const expired = "2000-01-01T00:00:00.000Z";
const future = "2999-01-01T00:00:00.000Z";
const png = () =>
  sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } })
    .png()
    .toBuffer();

test("resolved impact receipts dedupe only within the same source and workflow revision", async (t) => {
  const { app, call } = await fixture(t);
  await app.service.put(demoWorkflow(app.config.application));
  const input = {
    changed_paths: ["fixtures/reports.html"],
    source_revision: "source-1",
  };
  const first = (await app.service.impact(input)).questions[0];
  assert.equal(
    (
      await call(`/v1/questions/${first.id}/resolve`, "POST", {
        answer: "Reviewed",
      })
    ).status,
    200,
  );
  const duplicate = (await app.service.impact(input)).questions[0];
  assert.equal(duplicate.id, first.id);
  assert.equal(duplicate.status, "resolved");
  assert.equal(Object.keys(app.store.data.questions).length, 1);
  assert.notEqual(
    (await app.service.impact({ ...input, source_revision: "source-2" }))
      .questions[0].id,
    first.id,
  );
  await app.service.put(demoWorkflow(app.config.application, true));
  const revised = (await app.service.impact(input)).questions[0];
  assert.notEqual(revised.id, first.id);
  assert.equal(revised.status, "open");
});

test("pruning removes expired bytes and publications, keeps fresh artifacts and run history", async (t) => {
  const { app } = await fixture(t);
  await app.service.demo();
  const old = await app.service.artifact(await png());
  const fresh = await app.service.artifact(await png());
  const file = path.join(app.store.private, app.store.data.artifacts[old].file);
  const run = {
    id: "run",
    workflow_id: "export-report",
    revision: app.store.data.workflows["export-report"].revision,
    status: "passed",
    deployment: app.store.data.deployment,
    expires_at: future,
    steps: [{ artifact_id: old }],
  };
  app.store.data.runs.run = run;
  await app.service.publish("export-report", "run");
  const query = {
    application: app.config.application,
    question: "Export report",
    context: { role: "admin" },
  };
  assert.equal(app.service.query(query).status, "answered");
  app.store.data.artifacts[old].expires_at = expired;
  assert.equal(app.service.query(query).status, "unavailable");
  const pruning = app.service.pruneExpired();
  assert.equal(app.service.pruneExpired(), pruning);
  await pruning;
  await assert.rejects(fs.stat(file), { code: "ENOENT" });
  assert.equal(app.store.data.artifacts[old], undefined);
  assert.ok(app.store.data.artifacts[fresh]);
  assert.equal(app.store.data.runs.run.steps[0].artifact_id, undefined);
  assert.equal(app.store.data.publications.length, 0);
  await assert.rejects(app.service.publish("export-report", "run"));
  assert.equal(app.service.query(query).status, "unavailable");
});

test("expired uploads can be deleted repeatedly while GET stays unavailable", async (t) => {
  const { app, call } = await fixture(t);
  const id = await app.service.artifact(await png(), "upload");
  const file = path.join(app.store.private, app.store.data.artifacts[id].file);
  app.store.data.artifacts[id].expires_at = expired;
  assert.equal((await call(`/v1/artifacts/${id}`)).status, 404);
  assert.equal((await call(`/v1/artifacts/${id}`, "DELETE")).status, 200);
  assert.equal((await call(`/v1/artifacts/${id}`, "DELETE")).status, 200);
  assert.equal((await call(`/v1/artifacts/${id}`)).status, 404);
  await assert.rejects(fs.stat(file), { code: "ENOENT" });
});

test("orderly reopen prunes persisted expiry, recovers interrupted jobs and refuses another writer", async (t) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "flowwitness-lifecycle-"),
  );
  let app;
  t.after(async () => {
    if (app) await app.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  app = await startServer({ root, port: 0 });
  await assert.rejects(new Store(root).open(), /locked by another process/);
  const id = await app.service.artifact(await png());
  const file = path.join(app.store.private, app.store.data.artifacts[id].file);
  app.store.data.artifacts[id].expires_at = expired;
  app.store.data.publications.push({
    id: "expired-publication",
    expires_at: expired,
  });
  app.store.data.jobs.running = { id: "running", status: "running" };
  app.store.data.jobs.queued = { id: "queued", status: "queued" };
  await app.store.save();
  await app.close();
  app = null;
  app = await startServer({ root, port: 0 });
  await assert.rejects(fs.stat(file), { code: "ENOENT" });
  assert.equal(app.store.data.artifacts[id], undefined);
  assert.equal(app.store.data.publications.length, 0);
  for (const job of Object.values(app.store.data.jobs)) {
    assert.equal(job.status, "interrupted");
    assert.equal(job.error, "Service restarted");
  }
  const persisted = JSON.parse(
    await fs.readFile(path.join(app.store.private, "state.json"), "utf8"),
  );
  assert.equal(persisted.artifacts[id], undefined);
  await assert.rejects(new Store(root).open(), /locked by another process/);
});
