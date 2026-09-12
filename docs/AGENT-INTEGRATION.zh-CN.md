# 编码助手接入

[English](AGENT-INTEGRATION.md)

`skills/flowwitness/` 提供共享技能说明，指导助手编写明确的流程记录、调用 CLI、检查真实验证结果，并保留无法回答或需要澄清的状态。它不是后台录屏器，不会自动截获所有编码会话。

把技能目录复制到目标应用项目的对应位置：Claude Code 使用 `.claude/skills/flowwitness/`，Codex 使用 `.agents/skills/flowwitness/`，pi 使用 `.pi/skills/flowwitness/`。不要覆盖已有同名技能。让 CLI 可被找到，或告诉助手 FlowWitness 仓库内 `bin/flowwitness.mjs` 的绝对路径。每个宿主的发现与行为需要分别测试；提供技能不代表原生插件兼容性已经验证。

独立启动服务后，可以要求助手：“使用 FlowWitness 记录并验证测试管理员如何导出报告。”助手应检查真实页面，记录步骤与预期结果。CLI 和 HTTP 集成测试不需要付费模型调用。

要接收 GitHub 推送，可配置指向 `/v1/webhooks/github` 的 webhook，服务本地环境使用相同的 `FLOWWITNESS_WEBHOOK_SECRET`。GitHub 需要能访问的 HTTPS 地址，默认 localhost 不可从公网访问。处理器校验签名并拒绝不完整的改动列表；此时改用 CLI 对完整 Git 范围做影响检查。不会自动安装 Git hook。

第一版用任务队列处理验证，缺失事实进入审核问题。宿主原生事件钩子、定时推理与用户电脑执行属于后续工作。技术来源与证据边界见英文页。
