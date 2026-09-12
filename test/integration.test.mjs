import test from "node:test";
import assert from "node:assert/strict";
import { fixture, waitJob } from "./helpers.mjs";
test(
  "real Chromium v1 publication, v2 failure and repair",
  { timeout: 120000 },
  async (t) => {
    const { call, app } = await fixture(t, { stepTimeout: 1000 });
    await call("/v1/demo/setup", "POST", {});
    const verify = async () => {
      const r = await call("/v1/workflows/export-report/verify", "POST", {});
      assert.equal(r.status, 202);
      return waitJob(call, r.data.job.id);
    };
    const query = (extra = {}) =>
      call("/v1/query", "POST", {
        application: "demo-reports",
        question: "How do I export a report?",
        context: { role: "admin", locale: "en" },
        ...extra,
      });
    let job = await verify();
    assert.equal(job.status, "passed", job.error);
    const run = (await call("/v1/runs/" + job.run_id)).data.run;
    assert.ok(run.steps[0].artifact_id);
    assert.equal(
      (await call("/v1/artifacts/" + run.steps[0].artifact_id)).status,
      200,
    );
    assert.equal(
      (
        await call("/v1/workflows/export-report/publish", "POST", {
          run_id: job.run_id,
        })
      ).status,
      200,
    );
    assert.equal((await query()).data.status, "answered");
    assert.equal(
      (await query({ context: { role: "viewer" } })).data.status,
      "unavailable",
    );
    assert.equal(
      (await query({ context: { role: "admin", locale: "zh-CN" } })).data
        .steps[0].text,
      "选择导出报告。",
    );
    await call("/v1/demo/version", "POST", { version: "v2" });
    assert.equal((await query()).data.status, "unavailable");
    assert.equal(
      (await query({ deployment_version: "v1" })).data.status,
      "answered",
    );
    job = await verify();
    assert.equal(job.status, "failed");
    assert.ok(
      (await call("/v1/runs/" + job.run_id)).data.run.steps[0].artifact_id,
    );
    assert.equal(
      (
        await call("/v1/workflows/export-report/publish", "POST", {
          run_id: job.run_id,
        })
      ).status,
      400,
    );
    await call("/v1/demo/repair", "POST", {});
    job = await verify();
    assert.equal(job.status, "passed", job.error);
    assert.equal(
      (
        await call("/v1/workflows/export-report/publish", "POST", {
          run_id: job.run_id,
        })
      ).status,
      200,
    );
    assert.equal((await query()).data.steps.length, 2);
    const edited = (await call("/v1/workflows/export-report")).data.workflow;
    edited.title = "Edited workflow";
    await call("/v1/workflows", "POST", edited);
    assert.equal((await query()).data.status, "unavailable");
    app.store.data.publications.at(-1).expires_at = new Date(0).toISOString();
    assert.equal((await query()).data.status, "unavailable");
  },
);
