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

Set `FLOWWITNESS_URL` and load `FLOWWITNESS_TOKEN` from private local configuration. The CLI sends the existing Bearer authorization plus `x-flowwitness-client: cli`; the server resolves the principal and scope. Module calls require the corresponding server adapter and authorization. CLI availability does not prove that the backend is configured.

Use `flowwitness module <METHOD> <PATH> [JSON|@file]` (`api` is an alias). Only implemented `/v1` module routes are accepted. JSON input is limited to 1 MiB, paths to 8192 characters, GET requests have no body, and redirects are refused. `issues`, `knowledge`, and `agents` list records; `investigation <id>`, `reproduction <id>`, and `video <id>` fetch one record. Video responses contain authorized evidence links and metadata; they do not download video bytes.

```sh
flowwitness module POST /v1/issues '{"title":"Export fails","description":"Export button shows an error","locale":"en"}'
flowwitness module GET '/v1/knowledge?text=export&limit=10'
flowwitness module POST /v1/investigations '{"issueId":"ISSUE_ID","requiredCapabilities":["investigation"],"idempotencyKey":"export-investigation-1"}'
flowwitness module POST /v1/reproductions @reproduction.json
flowwitness module POST /v1/agents '{"ownerId":"AGENT_SUBJECT_ID","runtime":"codex","capabilities":["investigation"],"enabled":true}'
flowwitness module POST /v1/investigations/claim '{"capabilities":["investigation"]}'
flowwitness module GET /v1/videos/VIDEO_ID
```

Use IDs, approval references, targets, revisions and selectors returned or supplied by the operator. Reuse an idempotency key only for identical input. Registration and enqueue calls need operator scope; claim needs the matching registered agent identity. Keep lease tokens and private evidence links private. A queued job is not a completed investigation or reproduction, and fetching a video does not render or publish it.

The CLI returns FlowWitness guidance and evidence; it never authorizes actions on a customer's computer. Native customer computer-use execution, image understanding, generated voice and hosted video infrastructure remain separate integration work.
