# Cloudflare 预览

[English](CLOUDFLARE-PREVIEW.md)

本仓库包含一个小型 Cloudflare Worker，用于公开、动态的概念预览。它通过
Workers Static Assets 提供现有的中英文网站，并增加两个只读边缘接口：

**在线预览：** [flowwitness-preview.dave-z.workers.dev](https://flowwitness-preview.dave-z.workers.dev/)

- `GET /api/health` 返回新的运行时收据。
- `GET /api/preview?release=v1|v2` 返回页面使用的中英文演示状态。`v2` 会明确返回
  `needs_review`，因此不会把旧答案当作当前指引。

这个 Worker 是给赞助方看的预览入口，不是 FlowWitness 完整后端：它不会运行 Chromium、
保存私有制品、接收客户凭据、运行 FFmpeg，也不会公开认证客服接口。完整 Node 服务仍按
[`OPERATIONS.zh-CN.md`](OPERATIONS.zh-CN.md) 在本地或自托管环境运行。

## 部署

Wrangler 使用[`wrangler.jsonc`](../wrangler.jsonc)。Wrangler OAuth 凭据只保存在本机配置，
不要放入仓库或 Worker 变量。新机器先执行 `npx wrangler login`，然后：

```sh
npx wrangler deploy --config wrangler.jsonc
```

命令会打印临时 `workers.dev` URL。不要发送客户数据，直接检查：

```sh
curl --fail "$FLOWWITNESS_PREVIEW_URL/api/health"
curl --fail "$FLOWWITNESS_PREVIEW_URL/api/preview?release=v1"
curl --fail "$FLOWWITNESS_PREVIEW_URL/api/preview?release=v2"
```

上面是当前预览地址。它只是非生产演示地址；Worker 更名或删除后地址可能变化。

此预览启用了 `workers_dev`。自定义域名、生产后端、私有存储绑定或客户认证需要单独的
部署决定，本文件不代表已经完成。确认目标账号后，操作员可以运行
`npx wrangler delete flowwitness-preview` 移除预览。

## 证据边界

边缘响应证明 Worker 可访问，页面可以读取动态状态；它不证明第一阶段浏览器流程，
也不证明第二阶段 VM、视频或电脑操作集成。相关结论仍以[`VALIDATION.md`](VALIDATION.md)
和[`ADVERTISED-PROMISES.zh-CN.md`](ADVERTISED-PROMISES.zh-CN.md)中的收据为准。
