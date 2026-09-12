# ISSUES 模块

问题和消息保留英文或中文原文以及可信作者身份。客户必须绑定会话；操作员必须明确选择会话或 null 应用范围。解决问题需要操作员、同范围的解决条目和 expectedVersion。get 返回问题及消息。

方法与路由见 [模块契约](MODULE-CONTRACT.md)。按需注入 repository、jobs 和 artifacts。模块导入不会执行 I/O。未知路径返回 null，不支持的方法返回 405。错误包含 requestId 和固定公开消息。
