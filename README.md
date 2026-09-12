# FlowWitness

**Customer guidance that keeps up with your UI.**

An open source project for turning important product workflows into versioned, browser-verified customer instructions, accessible from any support chat or coding agent.

[简体中文](README.zh-CN.md)

**Status: interactive local demo and specifications. There is no installable CLI, running support API, or production integration yet.** The demo implements version/status checks using synthetic data; browser replay and evidence are simulated. This repository also publishes product direction, proposed contracts, and implementation acceptance criteria.

[Project site](https://callingforhelp.github.io/flowwitness/) · [Research](docs/RESEARCH.md) · [Product definition](docs/PRODUCT.md) · [Roadmap](ROADMAP.md) · [API proposal](docs/API.md)

## The problem

You move a button, change a permission, or redesign onboarding. Your application ships, but the instructions your customers and their agents receive still describe the old flow.

FlowWitness will connect **source changes → screens → workflow steps → verification evidence → support answers**. When a relevant change lands, the old guide becomes stale until the flow is checked against the right application version.

## The first useful version

For solo SaaS builders and small product teams shipping web UI changes with coding agents:

1. Record three to five important workflows in your repository with explicit steps, roles, and expected outcomes.
2. Link them to routes and source files. A push identifies possibly affected flows; a deployed preview supplies the version to verify.
3. Replay those flows in an isolated test environment and retain redacted screenshots and step results.
4. Let an existing chat call an endpoint with a question, optional screenshot/photo reference, and application context.
5. Return current verified instructions and evidence, or a focused clarification. Never silently present stale instructions as current.

A browser test passing is evidence for that version, role, and environment; it is not proof that every customer's account behaves identically.

## Scope

| Stage 1: earn trust | Stage 2: expand assistance |
| --- | --- |
| Git-tracked workflow records and explicit links | Automatic discovery across more application types |
| Push impact checks and deployment-aware replay | Broader scenario exploration and scheduled agent teams |
| Evidence-backed text and screenshot steps | Narrated, edited customer walkthrough videos |
| Headless query API and portable guidance object | Rich image understanding and customer computer-use execution |
| One shared CLI/skill path, adapters verified individually | Native plugins across Claude Code, Codex, and pi |

No chat application, helpdesk replacement, general observability platform, always-on screen surveillance, or graph database in the first release. Screenshot intake belongs in the initial contract; reliable inference from arbitrary photos requires separate evaluation.

## Participate

Read the [research and validation plan](docs/RESEARCH.md). The most valuable contribution right now is a redacted example of a support instruction that became wrong after a release: what changed, how it was discovered, and what a correct answer needed to know. Use the issue template; do not upload customer data.

See [CONTRIBUTING.md](CONTRIBUTING.md), [community conduct](CODE_OF_CONDUCT.md), and [security guidance](SECURITY.md). This is maintained by [@callingforhelp](https://github.com/callingforhelp); no response-time or delivery-date commitment is made.

## Local preview

```sh
python3 -m http.server 8080 --directory site
```

Run demo logic checks with `node --test site/demo.test.mjs`.

Open http://localhost:8080. The site is static and has no backend. Proposed JSON fixtures are in [examples](examples); they are synthetic, not captured product evidence.

## License and inspiration

[MIT](LICENSE). [Archify](https://github.com/tt-a1i/archify) inspired explicit typed relationships, traceable evidence, and portable representations. No Archify code is bundled; a diagram export could be added later. Browser verification and workflow freshness must be implemented independently.
