---
name: flowwitness
description: Record customer workflows for a web application, check their instructions in a browser, and query published FlowWitness guidance after UI changes. Use when maintaining customer operation guides alongside code.
---

# FlowWitness

Use the project's installed `flowwitness` CLI, or `node /path/to/flowwitness/bin/flowwitness.mjs`. Read its `--help` before the first invocation; do not assume an npm package has been published. The service URL is `FLOWWITNESS_URL`; tokens belong in local environment configuration and must not be printed.

## Record or update a customer workflow

Identify the customer's task, role, application route, expected outcome and relevant source files. Inspect the actual UI/source. Ask for a missing fact that changes the instructions; do not infer permissions or deployment identity from a screenshot.

Author a workflow JSON using the installed repository's `docs/RUNTIME-CONTRACT.md` Workflow object. Keep stable IDs, relative source paths, semantic customer instructions, and observable assertions. The initial runtime accepts explicit click/fill/assert steps; it does not discover all UI behavior automatically. Do not record credentials or destructive real-customer actions. Use operator-provided test data and deployment.

Validate and import with the CLI. Run verification and inspect the terminal run result and step evidence. A failed job needs a diagnosed workflow/UI change, not repeated identical retries. Updating a JSON record is not browser verification; passing verification is not publication. Publish only within the user's existing authorization after checking the result.

## After a code change

Use `impact --base <known-base-ref> --head <known-head-ref>` in the actual application repository. Inspect affected workflows and unknown source coverage. A push describes source changes; it does not prove what production deployed. Verify against the configured matching deployment, resolve missing facts, then publish an approved result. Do not change the user's deployment or Git hooks without task authorization.

## Help a customer

Query the service for the task and trustworthy application/role/version context. Return its published steps and evidence. When the service asks for clarification or reports unavailable instructions, preserve that result. Do not fill the gap with invented click locations. Image upload provides a private reference; this runtime does not infer tasks from pixels.

The response's guidance JSON is a FlowWitness format, not a universal computer-use protocol. Providing steps does not authorize taking control of a customer's machine. Native customer computer-use execution is outside this CLI; video jobs require the configured renderer and validated evidence.

## Module CLI for Claude Code, Codex and pi

Set `FLOWWITNESS_URL` to the configured service and load `FLOWWITNESS_TOKEN` privately from local environment configuration. The CLI sends the existing Bearer authorization and `x-flowwitness-client: cli` headers; the service resolves the principal and scope. Do not place tokens in commands, transcripts or examples. Modules require configured service adapters and an authorized principal; CLI availability does not prove backend readiness.

Use `flowwitness module <METHOD> <PATH> [JSON|@file]` (`api` is an alias). Responses are formatted JSON. Only implemented JSON module route/method pairs are accepted, with a 1 MiB JSON input limit and an 8192-character path limit. GET accepts query parameters, not a body. Redirects are refused. `issues`, `knowledge`, and `agents` list records; `investigation <id>`, `reproduction <id>`, and `video <id>` fetch individual records through the same client. Video fetch returns metadata and authorized evidence links, not downloaded video bytes.

Replace uppercase IDs with returned records, use the actual approved target/revision/selectors, and reuse an idempotency key only for identical input. Registration and enqueue calls need operator scope; claim needs the matching registered agent identity. Choose `claude-code`, `codex`, or `pi` as the registration runtime. Never invent an approval reference.

```sh
flowwitness module POST /v1/issues '{"title":"Export fails","description":"Export button shows an error","locale":"en"}'
flowwitness module GET '/v1/knowledge?text=export&limit=10'
flowwitness module POST /v1/investigations '{"issueId":"ISSUE_ID","requiredCapabilities":["investigation"],"idempotencyKey":"export-investigation-1"}'
flowwitness module POST /v1/reproductions @reproduction.json
flowwitness module POST /v1/agents '{"ownerId":"AGENT_SUBJECT_ID","runtime":"codex","capabilities":["investigation"],"enabled":true}'
# Use the registered agent principal for this call:
flowwitness module POST /v1/investigations/claim '{"capabilities":["investigation"]}'
flowwitness module GET /v1/videos/VIDEO_ID
```

`reproduction.json`:

```json
{
  "issueId": "ISSUE_ID",
  "target": {"origin": "https://preview.example.com", "environment": "preview", "revision": "COMMIT_SHA"},
  "approvalRef": "EXISTING_APPROVAL_REFERENCE",
  "steps": [{"action": "navigate", "value": "/reports"}, {"action": "assertVisible", "selector": "button.export"}],
  "limits": {"concurrency": 1, "maxDurationMs": 60000, "maxActions": 2},
  "idempotencyKey": "export-reproduction-1"
}
```

Keep claim output private: it can contain a job lease token needed for heartbeat/completion. The configured authentication token is redacted from CLI output, but returned job credentials and private evidence still require private handling. A queued job is not a completed investigation or reproduction; inspect the eventual job and evidence. Fetching a video does not render or publish it.

The CLI returns guidance and evidence and never authorizes actions on a customer's computer. An approval reference records separate existing authorization for the configured preview/test sandbox; it is not a grant created by the CLI. Follow the user's authorized scope and the host's computer-use controls before taking any action.
