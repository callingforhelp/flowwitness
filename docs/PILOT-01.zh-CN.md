# 试点 01：导出报表

状态：**已完成内部、无敏感数据试点**（2026 年 9 月 12 日）。这是对仓库内
应用夹具执行的真实本地浏览器运行，不是外部客户部署。

流程属于 `demo-reports` 应用和管理员角色。在 `/fixture/` 页面，操作员选择
“Export report”，预期看到“CSV is ready.”。记录位于
[`workflows/export-report.json`](../workflows/export-report.json)，包含夹具源文件、
明确选择器和断言。

[`test/integration.test.mjs`](../test/integration.test.mjs) 真实执行了两个发布周期：

1. **v1 — 发布：** Chromium 验证直接的 Export 按钮，保留截图证据，明确发布，
   `/v1/query` 返回答案。
2. **v2 — 破坏、修复、发布：** 按钮移入 More 菜单。旧选择器在 Chromium 中失败，
   当前答案被隐藏。修复流程，先打开 More 再选择 Export；Chromium 再次通过，
   发布新证据，答案返回两步已检查的操作。

运行记录：

```text
npm run test:integration
通过 1 个测试：真实 Chromium v1 发布、v2 失败与修复
```

夹具声明不会执行外部操作，报表数据是合成数据。这个试点证明第一阶段闭环，
不代表外部采用、登录应用覆盖、生产托管、E2B、视频交付或客户电脑操作已经完成。
下一次试点应使用外部采用者提供的一个无敏感数据流程。
