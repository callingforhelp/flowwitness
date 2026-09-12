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
