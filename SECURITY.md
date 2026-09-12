# Security

FlowWitness is a local alpha, not a hardened multi-tenant service. Use trusted test applications and non-sensitive data. Default unauthenticated mode binds loopback and assumes a trusted local machine. External binding requires separate admin/support credentials; deploy behind TLS and restrict access. The support credential belongs in a trusted chat backend that validates user role, never in a public browser client.

Workflow browsers restrict requests to the configured origin, but a browser context is not a hostile-code sandbox. Logged-in session imports and user-machine execution are not implemented. Review masking selectors before capturing any sensitive page. Uploaded images are opt-in, normalized and private; image content is not interpreted. Private files expire and are cleaned periodically.

Report vulnerabilities through GitHub Security → Report a vulnerability. Do not include customer data, real tokens or private screenshots in public issues. No security-response SLA is offered.

## 中文

当前是本地 alpha，不是经过强化的多租户服务。仅使用可信测试应用和无敏感数据。无认证模式只绑定本机；对外部署需分离的管理/客服令牌、TLS 和访问限制，客服后端须核实用户角色。不要把令牌放入公共网页。浏览器上下文不是恶意代码沙箱。录制敏感页面前检查遮盖规则；图片经用户同意后私密保存、重编码并过期清理，没有视觉识别。漏洞请通过 GitHub 私密安全报告提交。
