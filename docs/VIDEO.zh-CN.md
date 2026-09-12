# 视频工作室

将 `src/modules/video/index.mjs` 的 `createModule` 与作用域仓库、私有制品、
任务及渲染适配器组合。`src/adapters/ffmpeg/index.mjs` 提供
`createFFmpegRenderer`，需要本机 FFmpeg/ffprobe、libx264 和 drawtext。
中文字幕应通过可信配置 `fontFile` 指定含中文字形的字体；默认字体不保证覆盖。

操作员创建项目时只选一个来源：已验证的 `evidenceBundleId` 或上传的
`sourceArtifactId`。导入录像始终标记为未验证，不能发布为已验证指导。
`locale` 为 `en` 或 `zh`；旁白只使用上传音频，不调用模型或语音合成服务。

剪裁和有序片段使用源录像毫秒时间，片段必须位于剪裁范围内，并按数组顺序
拼接。字幕、高亮使用输出时间轴；高亮位置和尺寸使用 0～1 的归一化坐标。
标志和旁白只接受不透明制品 ID，不接受路径或网址。颜色为 `#RRGGBB`。
字幕保留原文，通过私有 UTF-8 文件传给 FFmpeg，禁用表达式展开。

接口为 `create/get/update/render/publish/handle`，路由见 MODULE-CONTRACT.md。
修改需要 `expectedVersion`，渲染需要 `idempotencyKey`。持租约工作者调用
`runRender(principal, {id, token})`；任务和制品适配器负责租约隔离与取消竞争。
修改会撤销旧输出链接并清除发布状态，渲染结果保持私有。

只有操作员可明确发布。发布与客户读取会重新检查证据状态、有效期、撤销状态
及编辑哈希。可信验证器必须在目标版本变化后更新证据状态。链接适配器必须在
每次下载时执行撤销、过期及当前证据资格检查，不能使用不可撤销的公开存储链接。

渲染通过无 shell 子进程执行，只允许本地文件协议。默认输入输出上限为
128 MiB，源尺寸上限 3840×2160，输出上限 15 分钟，执行超时 120 秒。
取消会终止编码；无论成功失败均删除临时目录。制品读取应提供可取消流，
任意卡住的适配器 Promise 无法由 JavaScript 强制终止。

运行 `node --test test/video*.mjs` 检查假适配器及微型真实 FFmpeg 渲染。
这些检查不代表云部署或中文字形覆盖已经验证。生产环境还需操作系统级媒体处理隔离。
