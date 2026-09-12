# AGENTS 模块

操作员注册代理能力，并通过 issueId 和 idempotencyKey 提交幂等调查。代理只能领取已注册能力的任务，并使用自己的有效租约令牌提交心跳与结果。注入的 jobs 接口负责原子隔离、配额、重试和结果验证。取消后拒绝迟到结果。无需导入模型运行时。

方法与路由见 [模块契约](MODULE-CONTRACT.md)。按需注入 repository、jobs 和 artifacts。模块导入不会执行 I/O。未知路径返回 null，不支持的方法返回 405。错误包含 requestId 和固定公开消息。
