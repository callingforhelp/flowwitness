# 调研与功能优先级

[English](RESEARCH.md) · 来源核查日期：2026 年 9 月 12 日。

## 证据边界

公开讨论说明操作文档维护确有痛点；厂商文档说明现有替代品和技术积木。它们不能证明 FlowWitness 已有需求、付费意愿或产品市场匹配。尚未开展用户访谈或试用，以下优先级都是待验证判断。

| 来源 | 观察 | 对项目的意义 |
| --- | --- | --- |
| [Intercom 社区：版本迭代后如何维护 FAQ](https://community.intercom.com/knowledge-base-6/how-do-you-keep-your-faq-and-knowledge-base-accurate-releases-after-releases-7754) | 从业者讨论过时内容与人工审核 | 支持“维护”痛点，样本小且自选择 |
| [技术写作社区：截图文档维护](https://www.reddit.com/r/technicalwriting/comments/1urqhka/keeping_screenshotheavy_docs_current_especially/) | 截图会随界面变化失效，讨论也涉及原生应用 | 浏览器方案不能覆盖其中全部需求 |
| [Scribe 官方入门](https://support.scribehow.com/hc/en-us/articles/8951146003741-New-User-Guide) | 录制操作即可生成截图步骤 | 仅做录制器差异化不足 |
| [Intercom Knowledge Hub](https://www.intercom.com/helpdesk/knowledge-hub) | 聚合知识并控制回答来源 | 应接入现有客服，而不是再造客服平台 |
| [Archify](https://github.com/tt-a1i/archify) | 类型化表示、明确关系、证据关联视图 | 借鉴关系设计，但图表正确不代表操作成功 |
| [Stagehand](https://docs.stagehand.dev/) 与 [Browserbase](https://docs.browserbase.com/platform/browser/getting-started/using-browser-session) | 已有浏览器自动化与记录基础 | 先做适配器，不自建浏览器云 |
| [Playwright 视频](https://playwright.dev/docs/videos) | 可保留浏览器运行视频 | 剪辑、配音、隐私与教学效果仍需额外开发 |
| [MCP 架构](https://modelcontextprotocol.io/docs/learn/architecture) | 提供工具与上下文交换协议 | 它不是统一鼠标/键盘操作语言 |
| [Claude Code 插件](https://code.claude.com/docs/en/plugins)、[hooks](https://code.claude.com/docs/en/hooks)、[pi](https://github.com/earendil-works/pi/tree/main/packages/coding-agent) | 宿主扩展方式各不相同 | 共享核心逻辑，各自验证兼容性 |

## 替代方案与假设

Scribe 类工具擅长创建指南，知识库 AI 擅长检索回答，浏览器测试擅长发现可观察回归，关系图擅长解释连接。FlowWitness 的假设是：把这些能力围绕“当前版本仍然正确的操作步骤”连接起来，能减少重复维护。

这不是完整竞品审计，不能宣称没有同类产品、全球首创或已优于现有方案。最重要的竞争对手可能只是成本很低的人工发布检查清单。

## 优先顺序

- **P0：版本与角色正确。** 指引再漂亮，对错版本也是错。先做元数据与明确拒答。
- **P0：3–5 个流程。** 选择反复被问到的报表、项目配置等任务，先避开付款/删除。
- **P0：改动影响与回放。** 直接解决维护，未知关系也要明示。
- **P0：独立接口。** 保留现有聊天；接口容纳图片引用，模糊情况追问，不等通用视觉成熟才交付价值。
- **P1：共享技能入口与结构化响应。** 原生宿主适配及客户机器执行另行验证。
- **P2：成品视频与代理团队。** 只有试用证明文字/截图或单队列不足时再做。

## 验证方式

邀请三位独立开发者自愿参与，每人带三个重复任务、两次近期界面变化及现有处理方式。先问上一次文档出错的具体过程、发现者、修复耗时、角色差异和维护意愿，再介绍方案。

先做本地种子数据网页，再进入获得许可的预览环境。植入界面变化、权限差异与模糊图片，测量误报、错误/过时回答、配置和维护时间、复用意愿与延迟。失败结果也发布匿名汇总。量化门槛见 [产品定义](PRODUCT.zh-CN.md)。

## 独立维护者开源方式与支持

按 [GitHub 开源指南](https://opensource.guide/starting-a-project/) 提供 README、贡献说明、行为规范与维护状态。用 [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) 托管静态网站，未来 API 需要单独运行。[MIT](https://choosealicense.com/licenses/mit/) 适合本项目允许广泛复用的意图；复制第三方代码时保留许可证和署名。

有限名称搜索没有发现明显同名开发工具，但不是商标审查。没有赞助、官方合作、托管 SLA 或外部服务额度承诺。

第一笔工程时间或编程代理额度最适合投入一个可验证里程碑：本地网页记录流程 → 改动界面 → 检测失效 → 回放验证 → API 返回步骤。先展示测试、失败边界和实际成本，再推动三位开发者试用。当前尚无赞助方承诺。
