# Validation evidence / 验证记录

2026-09-12. Local alpha, not production or pilot certification.

| Boundary | Evidence |
| --- | --- |
| Unit, API, lifecycle and concept demo | 13 Node test cases passed; includes auth scopes, signature/deduplication, validation, expiry cleanup, writer lock and recovery |
| Real Chromium integration | v1 success → explicit publication → v2 old-step failure → repair success → new publication; role, locale, version and evidence cases passed |
| Independent process/API acceptance | Python standard-library client starts the actual CLI server with temp state and authenticated tokens; real PNG evidence, publication and version/role/application boundaries passed |
| Connected operator UI | Setup, actual replay, private screenshots, publication, query, failure and repair passed; sidebar status, full image link, Chinese results and three viewport widths checked |
| Dashboard credentials | Invalid token then valid retry works; token not stored in localStorage and reload requires reconnection |
| Portable skill | Frontmatter validation passed; individual Claude Code/Codex/pi discovery and behavioral smoke tests have not been run |
| Container | Docker build and authenticated startup passed on GitHub Linux CI; Docker daemon unavailable on development Mac |
| Public backend / pilot | Not deployed to a public domain; no external customer pilot performed |

Reproduce from the repository after npm ci and Playwright Chromium installation:

```sh
npm test
npm run test:integration
npm run test:dashboard
python3 scripts/check-system.py
```

Tests use temporary isolated data directories. Synthetic fixture data is used, but browser execution and captured screenshots are actual. A passing fixture is not proof that a customer's application, credentials, network or deployment behaves the same way. The UI tests exercise the real HTTP service, not mocked responses.

CI: [Passing Linux runtime and container run](https://github.com/callingforhelp/flowwitness/actions/runs/34680028316), implementation commit 742a494. Public concept site deployment is a separate workflow and does not establish backend deployment.

中文：本地测试证明实际服务、浏览器、截图、发布与查询闭环，使用临时数据和合成报表。13 项单元/API/生命周期/概念演示测试通过；真实 Chromium 集成、独立进程 API 验收、中英文操作台与凭据重试也通过。未声称外部客户应用、宿主原生插件或生产部署已经验证。Linux CI 的运行时测试、容器构建与带认证启动检查均已通过。
