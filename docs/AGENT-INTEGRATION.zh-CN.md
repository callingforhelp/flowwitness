# 编码助手接入

[English](AGENT-INTEGRATION.md)

`skills/flowwitness/` 提供共享技能说明，指导助手编写明确的流程记录、调用 CLI、检查真实验证结果，并保留无法回答或需要澄清的状态。它不是后台录屏器，不会自动截获所有编码会话。

把技能目录复制到目标应用项目的对应位置：Claude Code 使用 `.claude/skills/flowwitness/`，Codex 使用 `.agents/skills/flowwitness/`，pi 使用 `.pi/skills/flowwitness/`。不要覆盖已有同名技能。让 CLI 可被找到，或告诉助手 FlowWitness 仓库内 `bin/flowwitness.mjs` 的绝对路径。每个宿主的发现与行为需要分别测试；提供技能不代表原生插件兼容性已经验证。

独立启动服务后，可以要求助手：“使用 FlowWitness 记录并验证测试管理员如何导出报告。”助手应检查真实页面，记录步骤与预期结果。CLI 和 HTTP 集成测试不需要付费模型调用。

要接收 GitHub 推送，可配置指向 `/v1/webhooks/github` 的 webhook，服务本地环境使用相同的 `FLOWWITNESS_WEBHOOK_SECRET`。GitHub 需要能访问的 HTTPS 地址，默认 localhost 不可从公网访问。处理器校验签名并拒绝不完整的改动列表；此时改用 CLI 对完整 Git 范围做影响检查。不会自动安装 Git hook。

第一版用任务队列处理验证，缺失事实进入审核问题。宿主原生事件钩子、定时推理与用户电脑执行属于后续工作。技术来源与证据边界见英文页。

## Claude Code、Codex 与 pi 的模块 CLI

设置 `FLOWWITNESS_URL`，并从本地私有配置读取 `FLOWWITNESS_TOKEN`。CLI 会发送已有的 Bearer 授权和 `x-flowwitness-client: cli`，由服务端解析主体与范围。模块调用仍需要服务端适配器和对应授权；能运行 CLI 不代表后端已经配置完成。

使用 `flowwitness module <METHOD> <PATH> [JSON|@file]`（`api` 是别名）。只接受已经实现的 `/v1` 模块路径；JSON 输入上限为 1 MiB，路径上限为 8192 个字符，GET 不接受请求体，并拒绝重定向。`issues`、`knowledge`、`agents` 可列出记录；`investigation <id>`、`reproduction <id>`、`video <id>` 可读取单条记录。视频响应包含授权后的证据链接和元数据，不会下载视频字节。

```sh
flowwitness module POST /v1/issues '{"title":"导出失败","description":"导出按钮显示错误","locale":"zh-CN"}'
flowwitness module GET '/v1/knowledge?text=export&limit=10'
flowwitness module POST /v1/investigations '{"issueId":"ISSUE_ID","requiredCapabilities":["investigation"],"idempotencyKey":"export-investigation-1"}'
flowwitness module POST /v1/reproductions @reproduction.json
flowwitness module POST /v1/agents '{"ownerId":"AGENT_SUBJECT_ID","runtime":"codex","capabilities":["investigation"],"enabled":true}'
flowwitness module POST /v1/investigations/claim '{"capabilities":["investigation"]}'
flowwitness module GET /v1/videos/VIDEO_ID
```

只使用操作员提供或接口返回的 ID、审批引用、目标环境、版本和选择器。只有完全相同的输入才可重用幂等键。注册和入队需要操作员范围；认领需要匹配的已注册代理身份。租约令牌和私有证据链接必须保密。排队不等于调查或复现完成，读取视频也不会自动渲染或发布。

CLI 返回 FlowWitness 格式的指导和证据，但不会授权在客户电脑上执行操作。原生客户电脑控制、图片理解、语音生成和托管视频基础设施仍属于独立的后续集成工作。
