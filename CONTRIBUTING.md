# Contributing

FlowWitness is in research and specification. Start with a concrete customer problem or a small change tied to Stage 1 in [ROADMAP.md](ROADMAP.md). For large implementation work, open an issue describing the workflow, proposed behavior and acceptance evidence first.

Useful contributions: redacted examples of stale help instructions, competing approaches we missed, reproducible browser fixtures, API boundary review and accessibility improvements to the site. Explain what happened, what you expected, and which version/role was involved. Never include customer screenshots, tokens or internal URLs without permission and redaction.

For documentation/site changes, preview with `python3 -m http.server 8080 --directory site`, check links and mobile layout, and run `git diff --check`. JSON examples must parse. Runtime test commands will be documented when runtime code exists; no installation command is available yet.

Keep PRs small. State validation performed and what remains untested. Contributions are accepted under the project's MIT license. No CLA is currently required. The maintainer, @callingforhelp, makes scope and release decisions; acceptance and response times are not guaranteed.

## 中文说明

请围绕第一阶段提交小范围贡献，大改动先在 issue 中说明问题与验收方式。最欢迎脱敏的文档过时案例、可复现网页和无障碍改进。不要提交客户数据或凭据。预览命令见 README；运行 `node --test site/demo.test.mjs` 并检查 `git diff --check`。贡献使用 MIT 许可，无 CLA；维护者决定范围与发布，不承诺回复时间。
