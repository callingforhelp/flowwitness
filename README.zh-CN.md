# FlowWitness

**让客户轻松用好你做的产品。**

[English](README.md) · [公开概念演示](https://callingforhelp.github.io/flowwitness/) · [运行说明](docs/OPERATIONS.zh-CN.md) · [API](docs/API.zh-CN.md) · [调研](docs/RESEARCH.zh-CN.md) · [路线图](ROADMAP.zh-CN.md)

FlowWitness 是可自托管的本地 alpha：保存客户操作流程和客服问题，在 Chromium 中检查已批准的预览流程，再把明确审核发布的指引交给已有的客服聊天。界面变动后，验证旧步骤、查看失败证据、修复流程并发布新版答案。

**后端已经实现。** 包含 CLI、HTTP 服务、中英文操作台、真实浏览器验证、私密截图和客服查询接口。GitHub Pages 上仍是**独立的模拟概念演示**，不托管实际后端。

## 本地运行

需要 Node.js 22 或以上、npm 及 Playwright Chromium。

```sh
git clone https://github.com/callingforhelp/flowwitness.git
cd flowwitness
npm ci
npx playwright install chromium
npm start
```

打开 **http://127.0.0.1:4310/app/**。本地模式不需要模型 API key，仅绑定本机回环地址，适合可信个人机器。对外绑定必须配置不同的管理员与客服令牌，详见 [运行说明](docs/OPERATIONS.zh-CN.md)。

1. 点击“创建演示流程”。
2. 执行浏览器验证，查看实际截图。
3. 手动发布成功验证的指引。
4. 提问“如何导出报告？”。
5. 在应用变更区域切换至 v2：旧答案不可用，旧步骤会在已变动的真实页面上验证失败。
6. 修复步骤，再次验证并发布。

报表数据是合成数据，但服务、浏览器操作、断言、截图和接口调用是真实的。操作台没有用模拟成功替代真实验证。

## 已实现

- 明确的 JSON 流程、源文件关系、角色、预期结果，以及 CLI 校验/导入/列表/Git 范围影响检查。
- 持久化任务、单并发 Chromium 队列、运行前后部署身份校验、遮盖敏感字段的截图与可过期私密图片。
- 手动审核发布；验证成功不等于自动向客户提供答案。
- 客服接口返回已发布步骤、截图引用和结构化指引，或明确追问/不可用。
- GitHub 签名推送接收与去重审核问题；推送不等于生产部署。
- 中英文操作台、用户同意后的图片上传与元数据清除、分离的管理员/客服凭据。
- 带作用域的问题与消息、关联证据的中英文推理库，以及供 Claude Code、Codex、pi 工作进程使用的租约隔离调查任务。
- 有界的预览/测试复现模块，可接入外部 VM/浏览器适配器；复现结果在审核前保持未验证。
- 私有 FFmpeg 视频工作室，支持剪辑、字幕、Logo、颜色、高亮、配音混合和过期链接；发布前视频保持私有。
- 六个模块的原生服务组合、独立持久化状态和带认证的附件链接交付。适配器在启动时注入，不强制模型或托管浏览器。
- [编码助手共享技能](docs/AGENT-INTEGRATION.zh-CN.md)和宿主安装说明。

## 当前边界

流程需要明确编写或导入，尚无自动录屏或从代码自动发现流程。查询匹配配置好的问题别名，不调用大模型。支持私密上传图片，但不识别图片内容。验证只面向操作者配置的可信应用，不是执行恶意代码的沙箱；登录后的客户会话回放需要额外适配。

一个服务对应一个应用、一个状态写入进程，不是多租户托管客服平台。没有声称生产部署、外部试用、托管 E2B 连接或原生宿主钩子已完成。客户电脑执行、图片理解和自动生成配音属于后续工作。详见[第一阶段边界](ROADMAP.zh-CN.md)和[模块组合说明](docs/COMPOSITION.zh-CN.md)。

## CLI 与验证

```sh
node bin/flowwitness.mjs --help
node bin/flowwitness.mjs init
node bin/flowwitness.mjs list
node bin/flowwitness.mjs validate examples/workflow.json
node bin/flowwitness.mjs verify export-report
node bin/flowwitness.mjs query '如何导出报告？'
npm test
npm run test:integration
node scripts/check-dashboard.mjs
python3 scripts/check-system.py
```

服务类命令需要运行中的实例；validate 只在本地校验。通过私有环境配置 FLOWWITNESS_URL 与需要时的 FLOWWITNESS_TOKEN，勿公开令牌。目前未发布 npm 注册表包。

浏览器测试使用临时数据和内置页面，证明本地行为，不证明外部客户部署。结果见 [验证记录](docs/VALIDATION.md)。

维护者 [@callingforhelp](https://github.com/callingforhelp)，采用 [MIT](LICENSE)。欢迎脱敏的重复客服问题、可复现流程失败或无敏感数据的预览试用。贡献与安全规范见仓库相应文档。不承诺响应时间，目前没有赞助或合作承诺。Archify 启发了关系与证据表达，未复制其代码；关系图不替代实际验证。
