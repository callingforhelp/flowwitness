# 编码助手接入

[English](AGENT-INTEGRATION.md)

`skills/flowwitness/` 提供共享技能说明，指导助手编写明确的流程记录、调用 CLI、检查真实验证结果，并保留无法回答或需要澄清的状态。它不是后台录屏器，不会自动截获所有编码会话。

把技能目录复制到目标应用项目的对应位置：Claude Code 使用 `.claude/skills/flowwitness/`，Codex 使用 `.agents/skills/flowwitness/`，pi 使用 `.pi/skills/flowwitness/`。不要覆盖已有同名技能。让 CLI 可被找到，或告诉助手 FlowWitness 仓库内 `bin/flowwitness.mjs` 的绝对路径。每个宿主的发现与行为需要分别测试；提供技能不代表原生插件兼容性已经验证。

独立启动服务后，可以要求助手：“使用 FlowWitness 记录并验证测试管理员如何导出报告。”助手应检查真实页面，记录步骤与预期结果。CLI 和 HTTP 集成测试不需要付费模型调用。

要接收 GitHub 推送，可配置指向 `/v1/webhooks/github` 的 webhook，服务本地环境使用相同的 `FLOWWITNESS_WEBHOOK_SECRET`。GitHub 需要能访问的 HTTPS 地址，默认 localhost 不可从公网访问。处理器校验签名并拒绝不完整的改动列表；此时改用 CLI 对完整 Git 范围做影响检查。不会自动安装 Git hook。

第一版用任务队列处理验证，缺失事实进入审核问题。宿主原生事件钩子、定时推理与用户电脑执行属于后续工作。技术来源与证据边界见英文页。

## Claude Code、Codex 和 pi 的模块 CLI

通过本地环境私密设置 `FLOWWITNESS_URL` 和 `FLOWWITNESS_TOKEN`。CLI 使用现有 Bearer 认证及 `x-flowwitness-client: cli` 请求头，由服务解析身份和作用域；不要把令牌放进命令或对话。模块还需要服务适配器和已授权身份，CLI 可用不代表后端已就绪。

调用 `flowwitness module <METHOD> <PATH> [JSON|@file]`，别名为 `api`。输出为格式化 JSON，仅允许已实现的模块路由与方法；JSON 输入上限为 1 MiB，路径上限为 8192 字符，不跟随重定向。GET 使用查询参数，不接受请求体。`issues`、`knowledge`、`agents` 列出记录；`investigation <id>`、`reproduction <id>`、`video <id>` 获取单条记录。视频读取返回元数据与获授权的证据链接，不下载视频文件。

以下示例依次创建问题、搜索知识、排队调查与复现、注册代理、领取任务并读取视频。将大写占位符替换为实际记录 ID，目标、版本和选择器必须来自获批准的测试环境。相同幂等键只用于相同输入。注册和排队需要 operator 身份，领取任务需要对应的已注册 agent 身份；runtime 可用 `claude-code`、`codex` 或 `pi`。不要编造审批引用。

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

领取结果可能含任务租约令牌，需私密保存以用于心跳和完成操作。CLI 会隐藏配置的认证令牌，但返回的任务凭据与私有证据仍须保密。排队成功不代表调查或复现完成，必须检查最终任务状态和证据。读取视频不会渲染或发布视频。

CLI 返回指导与证据，绝不授权在客户电脑上执行操作。审批引用只记录配置的 preview/test 沙箱已有的独立授权，不由 CLI 创造授权；实际操作仍须遵守用户授权范围及宿主的电脑控制规则。
