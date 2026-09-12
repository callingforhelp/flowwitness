#!/usr/bin/env node

const base = new URL(process.env.FLOWWITNESS_URL || "http://127.0.0.1:4310");
const adminToken = process.env.FLOWWITNESS_ADMIN_TOKEN || process.env.FLOWWITNESS_TOKEN || null;
const supportToken = process.env.FLOWWITNESS_SUPPORT_TOKEN || process.env.FLOWWITNESS_TOKEN || adminToken;
const applicationHint = process.env.FLOWWITNESS_APPLICATION || null;
const workflowHint = process.env.FLOWWITNESS_LAUNCH_WORKFLOW || null;
const expectedVersion = process.env.FLOWWITNESS_EXPECT_DEPLOYMENT_VERSION || null;
const expectedOrigin = process.env.FLOWWITNESS_EXPECT_DEPLOYMENT_ORIGIN || null;

if (["--help", "-h"].includes(process.argv[2])) {
  console.log(`Launch smoke checks a deployed FlowWitness instance without mutating state.

Environment:
  FLOWWITNESS_URL                         API origin (default http://127.0.0.1:4310)
  FLOWWITNESS_ADMIN_TOKEN                 management credential for authenticated mode
  FLOWWITNESS_SUPPORT_TOKEN               support credential for query/artifact reads
  FLOWWITNESS_APPLICATION                 expected application namespace
  FLOWWITNESS_LAUNCH_WORKFLOW             workflow ID (otherwise first verified workflow)
  FLOWWITNESS_LAUNCH_QUESTION             English question alias override
  FLOWWITNESS_LAUNCH_QUESTION_ZH          Chinese question alias override
  FLOWWITNESS_EXPECT_DEPLOYMENT_VERSION   optional deployment version assertion
  FLOWWITNESS_EXPECT_DEPLOYMENT_ORIGIN    optional deployment origin assertion`);
  process.exit(0);
}

const checks = {};
const fail = (label, message) => {
  throw new Error(`${label}: ${message}`);
};

async function request(path, { method = "GET", body, token } = {}) {
  const started = performance.now();
  let response;
  try {
    response = await fetch(new URL(path, base), {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        "x-flowwitness-client": "launch-smoke",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    fail(path, error instanceof Error ? error.message : "request failed");
  }
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.arrayBuffer();
  return {
    status: response.status,
    contentType,
    data,
    ms: Math.round(performance.now() - started),
  };
}

function expectStatus(result, status, label) {
  if (result.status !== status) fail(label, `expected HTTP ${status}, got ${result.status}`);
  return result.data;
}

const healthResult = await request("/health");
const health = expectStatus(healthResult, 200, "health");
if (health.status !== "ok" || !health.application) fail("health", "invalid response");
if (applicationHint && health.application !== applicationHint)
  fail("application", `expected ${applicationHint}, got ${health.application}`);
const authenticated = health.mode === "authenticated";
if (authenticated && (!adminToken || !supportToken))
  fail("credentials", "authenticated mode requires FLOWWITNESS_ADMIN_TOKEN and FLOWWITNESS_SUPPORT_TOKEN");
checks.health_ms = healthResult.ms;

const unauthenticatedWorkflows = await request("/v1/workflows");
expectStatus(unauthenticatedWorkflows, authenticated ? 401 : 200, "unauthenticated management boundary");
checks.unauthenticated_management_status = unauthenticatedWorkflows.status;

const appResult = await request("/app/");
expectStatus(appResult, 200, "operator app");
if (!appResult.contentType.includes("text/html")) fail("operator app", "expected HTML");
checks.operator_app_ms = appResult.ms;

const deploymentResult = await request("/v1/deployment", { token: adminToken });
const deployment = expectStatus(deploymentResult, 200, "deployment").deployment;
if (!deployment || !deployment.version || !deployment.environment || !deployment.base_url || !deployment.source_revision)
  fail("deployment", "missing release identity fields");
if (expectedVersion && deployment.version !== expectedVersion)
  fail("deployment", `expected version ${expectedVersion}, got ${deployment.version}`);
if (expectedOrigin && deployment.base_url !== new URL(expectedOrigin).origin)
  fail("deployment", `expected origin ${new URL(expectedOrigin).origin}, got ${deployment.base_url}`);
checks.deployment_ms = deploymentResult.ms;

const workflowsResult = await request("/v1/workflows", { token: adminToken });
const workflows = expectStatus(workflowsResult, 200, "workflow list").workflows;
if (!Array.isArray(workflows) || workflows.length === 0) fail("workflow list", "no workflows configured");
const workflow = workflowHint
  ? workflows.find((item) => item.id === workflowHint)
  : workflows.find((item) => item.status === "verified" && item.last_run?.status === "passed") || workflows[0];
if (!workflow) fail("workflow", `workflow ${workflowHint} not found`);
if (!Array.isArray(workflow.questions) || workflow.questions.length === 0)
  fail("workflow", "no question aliases");
const englishQuestion = process.env.FLOWWITNESS_LAUNCH_QUESTION ||
  workflow.questions.find((question) => /[A-Za-z]/.test(question)) || workflow.questions[0];
const chineseQuestion = process.env.FLOWWITNESS_LAUNCH_QUESTION_ZH ||
  workflow.questions.find((question) => /[\u3400-\u9fff]/u.test(question));
if (!chineseQuestion) fail("workflow", "no Chinese question alias; set FLOWWITNESS_LAUNCH_QUESTION_ZH");
checks.workflow_id = workflow.id;
checks.workflow_status = workflow.status;

async function query(question, locale) {
  const result = await request("/v1/query", {
    method: "POST",
    token: supportToken,
    body: {
      application: health.application,
      question,
      context: { role: workflow.role, locale },
    },
  });
  const answer = expectStatus(result, 200, `${locale} query`);
  if (answer.status !== "answered" || !Array.isArray(answer.steps) || answer.steps.length === 0)
    fail(`${locale} query`, `expected an answered workflow, got ${answer.status || "empty"}`);
  if (answer.guidance?.execution_mode !== "instructions_only")
    fail(`${locale} query`, "guidance did not remain instructions-only");
  return { result, answer };
}

const english = await query(englishQuestion, "en");
const chinese = await query(chineseQuestion, "zh-CN");
checks.query_en_ms = english.result.ms;
checks.query_zh_ms = chinese.result.ms;
checks.query_en_steps = english.answer.steps.length;
checks.query_zh_steps = chinese.answer.steps.length;

const evidence = [...(english.answer.evidence || []), ...(chinese.answer.evidence || [])];
const artifactId = evidence.find((item) => item.artifact_id)?.artifact_id;
if (!artifactId) fail("evidence", "published answer has no private artifact reference");
const artifactResult = await request(`/v1/artifacts/${encodeURIComponent(artifactId)}`, { token: supportToken });
const artifact = expectStatus(artifactResult, 200, "private artifact");
if (!artifactResult.contentType.startsWith("image/") || artifact.byteLength === 0)
  fail("private artifact", "empty or non-image response");
checks.artifact_ms = artifactResult.ms;
checks.artifact_bytes = artifact.byteLength;

console.log(JSON.stringify({
  status: "ok",
  url: base.origin,
  application: health.application,
  deployment: {
    version: deployment.version,
    environment: deployment.environment,
    source_revision: deployment.source_revision,
  },
  authenticated,
  checks,
}, null, 2));
