# 复现模块

`createModule({repository,jobs,browser?,clock?,config?})` 在导入时不执行 I/O。`create(operator,input)` 返回 `{item,job}`；`get(principal,{id})` 返回 `{item}`。路由为 POST `/v1/reproductions`（202）和 GET `/v1/reproductions/:id`（200）。不支持的方法返回 405，其他路径返回 null。协调器负责序列化平台异常。

创建需要 `issueId`、`idempotencyKey`、`approvalRef`、`target:{origin,environment,revision}` 和非空 `steps`。已认证操作员的提交表示审批意图；浏览器适配器必须在启动 VM 前，通过可信审批登记验证引用与作用域、目标和版本的绑定。问题必须属于完全相同的应用和会话。重复键返回同一任务，修改输入则冲突。客户必须绑定会话，只能读取基础字段、issueId 和 jobId。代理可以读取、执行，不能审批或创建。

目标只接受无凭据、路径、查询或片段的 HTTP(S) origin，环境只能为 `preview` 或 `test`，拒绝生产环境。默认限制为 `{concurrency:1,maxDurationMs:600000,maxActions:50}`；时间和动作数可调低。动作仅支持带 selector 的 `click`、`assertVisible`，无参数的 `screenshot`，以及 value 为同源绝对路径的 `navigate`。拒绝导航查询/片段、脚本、文本输入、未知字段和调用方提供的会话密钥及其引用。选择器、路径、版本与审批 ID 只能包含非敏感标识。本版本不支持输入凭据或文本。

## 执行适配器

协调器先通过任务接口领取具备 browser 能力的复现任务，然后调用 `run(agent,{id:reproductionId,token:job.lease.token,signal?})`。此方法使用已有租约，不领取其他任务。未配置浏览器时执行返回 503，创建与读取仍可用。

实现 `browser.start({scope,target,approvalRef,limits,signal})`，返回全新会话，提供 `step(step,{signal})`，可选 `stop()` 和 `destroy()`。适配器必须验证审批、在内部解析会话密钥、拒绝生产/未审批目标及跨域重定向、强制执行时间与动作上限，并在启动失败时清理部分创建的 VM。必须响应取消信号和停止/销毁调用。协调器或适配器负责跨进程原子预留每应用一个 VM；模块还提供单实例内每应用一个运行槽。多个模块实例不构成分布式并发锁。

每个动作前后及每 20 秒发送心跳（config.heartbeatMs 可缩短）。超时或取消会中断浏览器等待，退出时停止并销毁会话。租约失效时拒绝继续。丢弃浏览器原始输出；证据仅记录动作序号、类型与完成状态，artifactIds 为空，状态始终为 `unverified`，不代表验证或发布。最终由带租约令牌的 jobs.complete 接受证据引用。失败时尽可能删除临时证据，并使用通用错误码调用受租约保护的 jobs.fail。截图上传与可信验证需后续单独集成。适配器不得记录会话密钥。

运行 `node --test test/reproduction.test.mjs` 检查独立内存测试。这些测试不证明已部署 E2B 的行为或分布式预留能力。
