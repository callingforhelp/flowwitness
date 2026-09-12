# 知识库

`createModule({repository, artifacts, jobs, config})` 不依赖服务器、云服务或模型。`config.now` 可注入测试时钟，`currentRevision` 可指定当前版本。异步方法为 `create/get/search/publish/feedback`，参数为可信身份和输入。操作员必须明确选择会话或 `conversationId:null`；客户必须绑定会话。应用级范围不是通配符。

保存简短报告、假设、观察、尝试和解决方案：`kind` 为 `report/hypothesis/observation/attempt/resolution`，包含标题、摘要、`locale:en|zh`、标签，可附带版本、角色及同范围的问题、任务、证据和 `supersedes` 引用。来源身份由服务端生成。代理只能为自己持有有效租约的任务提交。新条目默认私有，不能自行声明验证或发布状态。不得提交思维链、私密推演、凭据或浏览器配置；字段校验不是文本脱敏工具。

搜索对标题、摘要和标签进行 Unicode NFKC 规范化、不区分大小写的子串匹配，保留中英文原文，按创建时间和 ID 排序。支持种类、标签、可见性及 `context:{release,role,locale}` 筛选。游标绑定身份、范围和查询。HTTP 查询使用 `locale/release/role`、逗号分隔的 `tags`、整数 `limit` 和字符串布尔值 `includeSuperseded`。不会编造翻译；读取时语言不同会标记 `translationMissing`。

路由为 POST/GET `/v1/knowledge`、GET `/v1/knowledge/:id`、POST `/v1/knowledge/:id/publish` 和 POST `/v1/knowledge/:id/feedback`。反馈值为 `helpful/unhelpful/outdated/wrong`，可带简短备注。更新使用版本比较，默认使用刚读取的版本，也可传 `expectedVersion`。

仅操作员可明确发布。证据必须来自同范围成功且未取消的任务结果，具有可信校验版本、匹配的发布版本、有效期限和可用的未撤销制品。制品哈希存在时必须匹配。仓储负责限制证据写入；本模块消费可信执行记录，不执行浏览器或自行验证执行收据。失败、过期、陈旧或未验证证据禁止发布，每次读取重新检查。客户只能读取当前有效的已发布内容。默认搜索仅在后继条目已发布且有效时隐藏旧条目。反馈不会将证据变为已验证。

本地测试：`node --test test/knowledge.test.mjs`，仅使用假适配器，不代表云集成或部署通过。搜索扫描仓储分页，规模扩大时需要语义等价的索引实现。
