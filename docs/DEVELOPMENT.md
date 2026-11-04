# DEVELOPMENT

开发、构建、打包、发布与人工验证手册。

## 1. 环境

| 项 | 要求 |
|---|---|
| Node.js | ≥ 22.19（本机 24.21.0） |
| esbuild | 本机 `E:/tools/esbuild`，可用 `DSH_RICH_MSG_ESBUILD_DIR` 覆盖 |
| DSH | `@deepseek-ai/dsh@0.2.2-alpha.2`（本机 `E:\tools\dsh-cli`） |
| 依赖 | `npm install`（lucide-react 进入产物，其余为开发依赖） |

本项目不使用 Vite；`tsc --noEmit` 仅做类型检查，构建由 esbuild 完成。

## 2. 目录

```
src/core        RichSpec Schema / 表达式求值 / 流式前缀解析
src/host        Node 插件：工具、Artifact Store、只读路由
src/client      浏览器插件：Fence 渲染、Snapshot 判定、引用解析、Action
src/ui          React Renderer + rich-ui.css + primitives
src/shared      双端共享协议常量与文档解析
tests           单元/集成测试（vitest + jsdom）
scripts         build.mjs / package.mjs
docs            技术文档
```

## 3. 构建

```powershell
npm install
node scripts/build.mjs
```

| 产物 | 说明 |
|---|---|
| `lib/index.js` | Host ESM 插件（esbuild bundle，platform=node，仅 Node 内置依赖） |
| `lib/client.js` | 浏览器 bundle，包装为 `window.__ModuleLoader__.load({id, factory(require){…}})` |

- React / react-dom / jsx-runtime 为 external，由 DSH Web 外壳静态模块表提供；
- lucide-react 与 CSS 文本一起打进 `lib/client.js`；
- `package.json` 的 `prepare` 会在 `npm install`（包括 git 依赖）时自动构建。

最近一次构建结果：

```
lib/index.js   48,876 bytes
lib/client.js 346,449 bytes   (0.1.1)
host esbuild warnings: 0
tsc --noEmit: 0 errors
```

## 4. 测试（已通过，结果保留）

```powershell
npx tsc --noEmit
npx vitest run
```

```
Test Files  15 passed (15)
Tests       226 passed (226)
```

> 0.1.1 修复记录：0.1.0 在长会话中会出现页面无响应——根因是流式期间每 token 重建 React root、每次 DOM 变更全量扫描整页、宿主 reconcider 与容器隐藏互相拉扯。0.1.1 改为纯事件驱动、默认只在稳定回答渲染、按行局部评估、原地更新、单 scope 单实例、重插上限。上述 226 项测试与隔离宿主压力验证（201 行模拟历史 + 150 次流式形状 DOM 变更：0 long task、最大帧间隔 19.5ms、单 root、卸载归零）均在 0.1.1 上通过。

覆盖范围：

| 测试文件 | 覆盖 |
|---|---|
| `tests/core/schema.test.ts` | RichSpec 全字段校验、非法输入、上限、实体/引用/图表/表格/控件 |
| `tests/core/evaluator.test.ts` | 表达式求值、算子树、状态、边界 |
| `tests/shared/protocol.test.ts` | ref 协议、Action 信封、id 语法、大小上限 |
| `tests/host/artifacts.test.ts` | 会话隔离、TTL、容量、淘汰、清理 |
| `tests/host/tools.test.ts` | 工具 Schema、中性描述、校验/发布行为、取消信号 |
| `tests/host/route.test.ts` | 只读路由：200/404/405/HEAD、跨会话拒绝 |
| `tests/host/neutrality.test.ts` | 无 prompt/persona/skill 注入、无运行时文件读取 |
| `tests/client/chat-view.test.ts` | 最终性判定、reasoning/text 区分、Artifact 索引 |
| `tests/client/fence-claim.test.ts` | 语言门控、通用标签 payload 特征、非法文档 |
| `tests/client/dom-renderer.test.tsx` | 挂载/还原、中间步骤/推理/工具行不渲染、诊断、回撤 |
| `tests/client/artifact-resolver.test.ts` | 会话日志解析、路由兜底、缺失处理 |
| `tests/ui/*` | 上游 RichResponse / primitives / persistence / entityTab 回归 |

> 按交付要求，自动化 CDP 模型端到端测试不再继续，真实模型验证改为人工执行（见第 5 节）。

## 5. 在真实 DSH 中人工验证

### 5.1 安装到独立 profile

```powershell
# 1) 构建
node scripts/build.mjs

# 2) 新建 profile（不修改在用的 web profile）
$profile = "$env:USERPROFILE\.dsh\profiles\richmsg-test"
New-Item -ItemType Directory -Force "$profile\node_modules" | Out-Null

# profile/package.json
@'
{
  "name": "dsh-profile-richmsg-test",
  "private": true,
  "dependencies": { "dsh-rich-msg": "link:E:/DSH_WORKSPACE/dsh-rich-msg" },
  "dsh": { "profile": { "bundles": [
    "@deepseek-ai/dsh-base",
    "@deepseek-ai/dsh-web-app",
    "dsh-rich-msg"
  ], "patchReload": "live" } }
}
'@ | Set-Content "$profile\package.json" -Encoding utf8

# 3) 建立包链接
New-Item -ItemType Junction -Path "$profile\node_modules\dsh-rich-msg" -Target "E:\DSH_WORKSPACE\dsh-rich-msg"

# 4) 启动（日志会打印带 token 的 URL）
node <dsh>/lib/bin.js --profile richmsg-test --host 127.0.0.1 --port 58470 --no-open
```

> 开发期已用同样的独立 profile 验证过：插件出现在 boot 图、模块经 `/plugins/…` 正常分发、浏览器半生效、Fence 渲染/工具行/普通代码/流式行行为符合预期、卸载还原、零控制台错误；并留下浅色/深色/390px 截图（本地开发证据，未纳入仓库）。

### 5.2 人工验收清单

1. **Fence 通道**：让模型只输出一个 `rich-msg` 代码块（例如 `{"version":1,"nodes":[{"type":"text","content":"Hello"},{"type":"stat","label":"Score","value":42}]}`），确认最终回答中原位置出现组件、源码块隐藏。
2. **推理排除**：使用会输出 reasoning 的模型，让推理中出现 `rich-msg` 围栏，确认推理区域不渲染富内容。
3. **工具阶段排除**：调用 `rich_msg_publish` 后，确认工具行只显示普通工具卡片，没有富内容。
4. **引用渲染**：最终回答写 `{"version":1,"ref":"<publish 返回的 id>"}`，确认渲染位置正确。
5. **未引用不展示**：publish 后最终回答不写引用，确认页面不出现该 artifact。
6. **流式**：观察生成过程中只出现已闭合的合法内容，并在该步骤转为中间步骤时回撤。
7. **非法 JSON**：流式中保持代码块；稳定后显示诊断卡片（含错误与源码复制）。
8. **普通代码块/其它语言**：完全不受影响。
9. **刷新/历史重放**：刷新后历史回答仍渲染；控件状态按会话/行恢复。
10. **主题与窄屏**：浅色/深色、约 390px 宽度。
11. **卸载**：禁用插件后页面恢复原生渲染，无残留 DOM/样式。

## 6. 打包

```powershell
node scripts/package.mjs
```

```
dist/dsh-rich-msg-<version>.zip          # 可直接解压进 profile 的 node_modules
dist/dsh-rich-msg-<version>.zip.sha256
```

ZIP 内容：`package.json`、`cordis.patch.yml`、`lib/index.js`、`lib/client.js`、`README.md`、`LICENSE`、`docs/*.md`。
打包脚本会自动先执行构建。

最近一次打包结果：`dsh-rich-msg-0.1.0.zip`（123,812 bytes）。

## 7. 发布到 GitHub（不使用 force push）

目标仓库：`https://github.com/Htao-uu/dsh-rich-msg`（上游 fork）。

安全规则：

1. **绝不 force push**；
2. 新提交的父提交必须是远端 `main` 当前提交，保证 fast-forward；
3. 远端已有文件（图片等）不因本地缺失而被误删；
4. 推送前后用 `git ls-remote origin refs/heads/main` 核对。

流程：

```powershell
git remote add origin https://github.com/Htao-uu/dsh-rich-msg.git
git fetch --depth 1 --filter=blob:none origin main   # 只取提交与树，不下载二进制
git reset --mixed FETCH_HEAD                          # index = 远端树
git add -A                                            # 应用本次重构（含删除）
git commit -F commit-message.txt
git push origin HEAD:main                             # 普通 push
git ls-remote origin refs/heads/main                  # 与本地 HEAD 一致
```

若直连 Git 不可用，可改用 GitHub REST API（`api.github.com`）：以远端 main SHA 为父提交创建 blob/tree/commit 并更新 ref，同样不使用 force。

## 8. 宿主升级后的复核

1. 重新检查宿主类型：`dsh-client-ui-chat`（slot 契约）、`dsh-client-ui-conversation`（snapshot）、`dsh-host-webserver`（路由）、`dsh-tools`（工具契约）；
2. `npx tsc --noEmit` 与 `npx vitest run`；
3. 在独立 profile 中按第 5 节人工复验；
4. 重点复核 DOM 标记：`data-chat-flow-kind` / `data-chat-node-key` / `data-code-block-content` / `data-ds-dark-theme`；
5. DOM 变化时渲染器失败关闭（保留原生代码块），需更新 `src/client/dom-renderer.tsx` 选择器后复验。

## 9. 未验证 / 已知限制

- **真实模型 Fence / Tool 双通道端到端**：未由自动化验证（按交付要求改为人工，见 5.2）；判定与解析逻辑由单测覆盖。
- 宿主若改变工具结果/快照结构，引用解析需要重新验证。
- 多标签页、Android WebView、超长历史压测：未验证。
- 进程内 Artifact Store 不跨进程共享；历史引用仍依赖会话日志路径。
- `sessionStorage` 持久化仅标签内有效。

## 10. 代码约定

- 双端共享代码放 `src/shared` 或 `src/core`，禁止引入 Node/浏览器专属 API；
- React 组件不得直接依赖 Cordis 服务；
- 所有交互副作用必须来自用户点击；
- 新增节点类型必须同时更新 `src/core/schema.ts` 与 `docs/COMPONENTS.md`；
- 不要重新引入 prompt/persona/skill 注入，由 `tests/host/neutrality.test.ts` 守护。
