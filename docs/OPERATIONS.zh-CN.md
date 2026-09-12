# 运行与维护

[English](OPERATIONS.md)

在仓库执行 `npm ci`、`npx playwright install chromium`、`npm start`，打开 http://127.0.0.1:4310/app/。Linux 可能需要 `npx playwright install --with-deps chromium`。不需要模型密钥。

操作台调用真实 API，不会离线返回模拟成功。创建演示流程、验证、看截图并手动发布。`/fixture/` 是实际样例页面，`/` 的营销演示仍然独立且使用模拟数据。

流程保存在服务工作目录下 `workflows/<id>.json`；私密状态和截图默认位于 `.flowwitness/private/`。仅提交审核后的流程文件，勿提交私密状态。手工改文件后需重新通过 CLI 或操作台导入；不会自动监控文件。备份应在服务停止后写入私密存储，一个数据目录只允许一个写入进程。

配置变量完整列表见英文页：HOST/PORT、FLOWWITNESS_APPLICATION、DATA_DIR、PUBLIC_ORIGIN、ALLOWED_ORIGINS、ADMIN_TOKEN、SUPPORT_TOKEN、WEBHOOK_SECRET；CLI 使用 FLOWWITNESS_URL/TOKEN/ROLE/LOCALE。默认单应用 demo-reports，绑定本机 127.0.0.1:4310。

对外绑定需两个不同的强随机令牌，建议至少 32 字符。不要公开，操作台只在内存保存。`npm start` 不会自动读 `.env`；显式加载可用 `node --env-file=.env bin/flowwitness.mjs serve`。外部部署需要 TLS、可信来源、私密持久存储和 Chromium 环境。托管模式可设置 `FLOWWITNESS_STATE_BACKEND=insforge`，应用迁移文件并把项目管理员密钥只放在服务端；`FLOWWITNESS_BROWSER_ORIGIN` 可指向服务私有回环地址，让浏览器不经过公网反向代理。客服令牌只给会验证客户角色的可信聊天后端，不放在公共网页中。当前不支持多租户托管。

## 接入自己的应用

配置允许访问的应用来源和版本身份接口。接口返回 `{"version":"发布版本","source_revision":"提交版本"}`；操作台部署设置填写相同值。验证前后均检查身份。

从 examples/workflow.json 开始，修改真实选择器、预期结果与源码路径，导入 schema-1 流程。使用安全测试环境和无敏感数据的账号。当前支持点击、固定文本填写、断言，不执行任意脚本，不自动转移凭据，也不导入登录会话。浏览器上下文不等于恶意代码沙箱。

## 推送与审核

在应用 Git 仓库调用 CLI impact 对完整 base/head 比较。服务列出受影响流程、未知映射和审核问题。GitHub webhook 需配置签名密钥与公网可达地址；推送只触发审核，不等于部署或自动发布。不完整、强推、新建/删除等需要完整差异的情况应使用 CLI。

应用实际改变后再更新部署身份，解决问题、重新验证并发布。有有效证据的旧版本指引可以继续服务显式请求旧部署版本的客户。

## 容器与恢复

提供 Dockerfile 与 compose.yaml。准备私密管理员/客服令牌后可 `docker compose up --build`。端口默认只映射本机，数据持久化到 /data。首次开发验证环境没有 Docker daemon，需在目标环境验证容器。

正常退出释放写锁。崩溃可能留下 writer.lock；先核实记录的 PID 确实停止，再处理该锁，勿删除活跃进程的锁。重启会把未完成任务标为 interrupted，需新建验证，不可伪造成功。

图片须用户同意，限制类型/大小并重编码去除元数据，没有视觉理解。截图遮盖密码输入、data-private 及配置的敏感选择器；保存前检查自己的脱敏范围。图片私密且会过期。

当前没有定时推理代理、视频生成或客户电脑操作。问题按已配置别名匹配，不认识的表述会追问。
