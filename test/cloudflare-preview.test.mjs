import test from "node:test";
import assert from "node:assert/strict";
import worker from "../cloudflare/worker.mjs";

const assets = {
  fetch(request) {
    return new Response(`asset:${new URL(request.url).pathname}`, {
      headers: { "content-type": "text/plain" },
    });
  },
};
const call = (path, init) => worker.fetch(new Request(`https://preview.test${path}`, init), { ASSETS: assets });
const body = async response => response.json();

test("Cloudflare preview exposes a dynamic health response", async () => {
  const response = await call("/api/health");
  assert.equal(response.status, 200);
  const value = await body(response);
  assert.equal(value.runtime, "cloudflare-worker");
  assert.equal(value.backend, "concept-only");
  assert.ok(value.generatedAt);
});

test("Cloudflare preview returns bilingual release state without claiming a browser run", async () => {
  const v1 = await body(await call("/api/preview?release=v1"));
  assert.equal(v1.kind, "flowwitness-preview-v1");
  assert.equal(v1.scenario.status, "ready_for_local_check");
  assert.equal(v1.workflow.steps[0].text_zh, "选择导出报告。");
  assert.match(v1.scenario.note, /does not claim a Chromium run/);
  const v2 = await body(await call("/api/preview?release=v2"));
  assert.equal(v2.scenario.status, "needs_review");
  assert.equal(v2.workflow.steps[0].id, "review");
});

test("Cloudflare preview rejects unknown releases and non-GET API calls", async () => {
  assert.equal((await call("/api/preview?release=v3")).status, 400);
  assert.equal((await call("/api/health", { method: "POST" })).status, 405);
});

test("Cloudflare preview delegates non-API requests to static assets", async () => {
  const response = await call("/");
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "asset:/");
});
