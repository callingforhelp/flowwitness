import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import sharp from "sharp";
import { fixture } from "./helpers.mjs";
import { workflow } from "../src/schema.mjs";
import { demoWorkflow } from "../src/service.mjs";
import { Store } from "../src/store.mjs";
test("workflow validates metadata and rejects unsafe source/action", () => {
  const w = demoWorkflow("demo-reports");
  assert.equal(workflow(w, "demo-reports").revision.length, 64);
  for (const modify of [
    (w) => (w.source_paths = ["../secret"]),
    (w) => (w.steps[0].action.type = "evaluate"),
    (w) => w.steps.push(w.steps[0]),
    (w) => (w.application = "other"),
  ]) {
    const bad = structuredClone(w);
    modify(bad);
    assert.throws(() => workflow(bad, "demo-reports"));
  }
});
test("local API, lock, body, image and context boundaries", async (t) => {
  const { app, call, root } = await fixture(t);
  assert.equal((await call("/health")).data.mode, "local");
  await assert.rejects(new Store(root).open());
  assert.equal(
    (
      await fetch(app.config.origin + "/v1/demo/setup", {
        method: "POST",
        body: "{}",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/v1/demo/setup",
        "POST",
        {},
        { origin: "https://evil.example" },
      )
    ).status,
    403,
  );
  assert.equal((await call("/v1/demo/setup", "POST", {})).status, 200);
  assert.equal(
    (
      await call("/v1/query", "POST", {
        application: "other",
        question: "Export report",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("/v1/query", "POST", {
        application: "demo-reports",
        question: "Unknown",
      })
    ).data.status,
    "clarification_needed",
  );
  assert.equal(
    (
      await call("/v1/query", "POST", {
        application: "demo-reports",
        question: "Export report",
        context: { role: "admin" },
      })
    ).data.status,
    "unavailable",
  );
  assert.equal(
    (
      await call("/v1/images", "POST", {
        consent: true,
        image_base64: Buffer.from("<svg/>").toString("base64"),
      })
    ).status,
    400,
  );
  const png = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const uploaded = await call("/v1/images", "POST", {
    consent: true,
    image_base64: png.toString("base64"),
  });
  assert.equal(uploaded.status, 201);
  assert.equal(
    (await call("/v1/artifacts/" + uploaded.data.artifact.id)).status,
    200,
  );
  assert.equal(
    (await call("/v1/artifacts/" + uploaded.data.artifact.id, "DELETE", {}))
      .status,
    200,
  );
  assert.equal(
    (await call("/v1/artifacts/" + uploaded.data.artifact.id)).status,
    404,
  );
  app.store.data.jobs.recovery = { id: "recovery", status: "running" };
  await app.store.save();
});
test("authenticated scopes and signed webhook dedupe/truncation", async (t) => {
  const admin = "admin-".repeat(6),
    support = "support-".repeat(6),
    secret = "webhook-secret";
  const { call } = await fixture(t, {
    adminToken: admin,
    supportToken: support,
    webhookSecret: secret,
  });
  const ah = { authorization: "Bearer " + admin },
    sh = { authorization: "Bearer " + support };
  assert.equal((await call("/v1/workflows")).status, 401);
  assert.equal((await call("/v1/workflows", "GET", null, sh)).status, 403);
  assert.equal((await call("/v1/demo/setup", "POST", {}, ah)).status, 200);
  assert.equal(
    (
      await call(
        "/v1/query",
        "POST",
        { application: "demo-reports", question: "" },
        sh,
      )
    ).data.status,
    "clarification_needed",
  );
  const body = {
    after: "sha2",
    commits: [{ added: [], modified: ["fixtures/reports.html"], removed: [] }],
  };
  const headers = (b) => ({
    "x-hub-signature-256":
      "sha256=" +
      createHmac("sha256", secret).update(JSON.stringify(b)).digest("hex"),
    "x-github-event": "push",
    "x-github-delivery": "delivery-1",
  });
  assert.equal((await call("/v1/webhooks/github", "POST", body)).status, 403);
  assert.deepEqual(
    (await call("/v1/webhooks/github", "POST", body, headers(body))).data
      .affected,
    ["export-report"],
  );
  assert.equal(
    (await call("/v1/webhooks/github", "POST", body, headers(body))).data
      .duplicate,
    true,
  );
  const bad = { ...body, size: 2 };
  assert.equal(
    (
      await call("/v1/webhooks/github", "POST", bad, {
        ...headers(bad),
        "x-github-delivery": "delivery-2",
      })
    ).status,
    400,
  );
});

test("wildcard binding uses reachable loopback public origin", async (t) => {
  const { app, call } = await fixture(t, {
    host: "0.0.0.0",
    adminToken: "a".repeat(24),
    supportToken: "s".repeat(24),
  });
  assert.equal(new URL(app.config.origin).hostname, "127.0.0.1");
  assert.equal((await call("/health")).status, 200);
});
