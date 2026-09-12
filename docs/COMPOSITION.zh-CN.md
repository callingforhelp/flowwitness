# 原生模块组合

`createServer` 默认挂载 issues、knowledge、agents、reproduction、video 和 maintenance。返回的 `moduleRuntime` 提供 `modules`、`repository`、`artifacts`、`jobs`、`handle` 和 `close`。兼容旧集成时可设置 `modules: false`。

平台快照和写入锁位于旧私有数据目录的 `modules` 子目录，与工作流状态分开。关闭服务器会关闭两个存储。导入模块不会启动任务。服务器的 `browser`、`renderer` 适配器均可选；不会自动启动 FFmpeg 或后台工作进程。模块配置通过 `moduleConfig` 注入。

请求先通过现有令牌认证、Host/Origin 检查、速率限制和请求体限制。通过服务器配置设置可信身份：`modulePrincipals: {admin: {subjectId, role, conversationId}, support: {subjectId, conversationId}}`。应用标识始终取自服务器配置。admin 默认为 operator，默认使用 conversationId 为 null 的应用范围，也可配置为 agent。support 固定映射为 customer，访问模块必须配置会话绑定。请求头、查询和请求体不能选择身份或会话。一个共享 support 令牌仅代表一个配置好的会话，并非多客户认证系统。

协调器向模块传入解析后的查询参数和 requestId。模块错误使用 requestId；旧接口继续使用 request_id。认证模式下，读取私有附件链接需要有效 Bearer 令牌以及对应范围内未过期的链接令牌。本地模式沿用原有回环地址信任模型。

maintenance 的方法接受 `(principal, input)`，仅允许 operator。注入的 `workflowAdapter` 实现 `impact(input)`、`verify(input)`、`publish(input)`。默认适配器调用原工作流服务，验证和发布参数使用 workflowId、runId。HTTP 处理继续交给旧路由，保留工作流及查询生命周期。

针对性检查：`node --test test/composition.test.mjs test/unit.test.mjs test/lifecycle.test.mjs`。
