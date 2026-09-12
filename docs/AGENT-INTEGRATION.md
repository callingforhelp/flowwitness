# Coding-assistant integration

[简体中文](AGENT-INTEGRATION.zh-CN.md)

FlowWitness ships a portable skill in `skills/flowwitness/`. It teaches an assistant to author explicit workflow records, invoke the CLI, inspect real verification results, and preserve unavailable/clarification responses. It does not install a background screen recorder or automatically intercept every coding session.

From the FlowWitness checkout, copy the skill directory into the target project's skill directory:

| Host | Project skill location | Integration boundary |
| --- | --- | --- |
| Claude Code | `.claude/skills/flowwitness/` | Skill instructions; no automatic lifecycle hook |
| Codex | `.agents/skills/flowwitness/` | Skill instructions and CLI; no native plugin claimed |
| pi | `.pi/skills/flowwitness/` | Skill instructions; no native extension claimed |

For example, in your application repository, copy `/path/to/flowwitness/skills/flowwitness` into the selected directory. Make the FlowWitness CLI available or tell the assistant its absolute `bin/flowwitness.mjs` path. Do not overwrite an existing skill of the same name without checking it.

Start the service separately, then ask: “Use FlowWitness to record and check how a test administrator exports a report.” The assistant should inspect the actual app and author an explicit workflow. CLI and HTTP integration can be tested without a paid model call. Each host's discovery and behavior must be tested separately before claiming full compatibility.

For GitHub automation, configure a push webhook pointing to `/v1/webhooks/github`, with the same locally held `FLOWWITNESS_WEBHOOK_SECRET` as the service. A public HTTPS service is required for GitHub to reach it; the default localhost server is not a public webhook receiver. The handler checks signatures and refuses incomplete change lists; use CLI impact over the complete Git range in that case. No hook is installed automatically.

A job queue replaces a team of continuously running agents in this first version. Missing facts appear as review questions. Native hooks, scheduled reasoning and computer-use execution remain future work.

Sources checked September 12, 2026: [Claude skills](https://code.claude.com/docs/en/skills), [Codex skills](https://developers.openai.com/codex/skills/), [pi skills](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md). These document extension surfaces, not a tested FlowWitness integration receipt.

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
