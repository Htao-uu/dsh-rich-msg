# CHANGES

相对上游 `kyoukisu/dsh-rich-ui@0.6.2` 的完整变更报告。

## 0.1.1（稳定性修复）

0.1.0 在长会话中会出现页面无响应（"此页面没有响应"）。根因是渲染调度而非数据协议：

1. 流式期间每来一个 token 就销毁并重建一个 React root；
2. 每次 DOM 变更全量扫描整个页面，长会话 / 长历史下开销失控；
3. 复用分支把已渲染容器反向设为 `hidden`，与宿主 reconciler 反复拉扯。

0.1.1 修复：

- 渲染调度改为**纯事件驱动**（DOM MutationObserver 批次 / Chat Snapshot 订阅 / `visibilitychange`，微任务合并；无定时器、无轮询、无 rAF 循环）；
- **默认只在稳定的最终回答渲染**（流式预览改为可选且默认关闭），消除 per-token React 重建；
- 按事件命中的行**局部评估**，行签名缓存使重复扫描零解析、零重绘；
- 同一围栏**原地更新**，不重建 root；
- **每个 document scope 只允许一个渲染器实例**；
- 宿主移除外来容器时最多重插 3 次，超限放弃并恢复原生代码块；
- 修复复用分支的 `hidden` 反转 bug；
- 删除对已移除的 `prompt-rich-ui` 目录的残留测试引用。

验证：`tsc --noEmit` 0 错误；15 个测试文件 / 226 项测试通过；隔离宿主压力验证（201 行模拟历史 + 150 次流式形状 DOM 变更）0 long task、最大帧间隔 19.5ms、单 root、卸载归零、无控制台错误。

## 1. 总体

| 维度 | 上游 | dsh-rich-msg |
|---|---|---|
| 定位 | 面向单个 Agent 产品的富回答插件（含模型行为注入） | 通用、无行为倾向的富内容渲染引擎 |
| 输出通道 | Markdown fence（DOM 适配） | Fence + Tool Bridge 双通道 |
| 模型上下文 | 自动注入 systemPrompt 段落 + 提示文件 | 零注入；工具描述纯技术 |
| 最终消息判定 | 仅 `assistant-step` 祖先 | Snapshot 最终性 + 推理排除 + 流式回撤 |
| 主题 | 自有配色 + 部分桥接 | 全量 DSH token 桥接（明/暗/移动端） |
| 构建 | Vite + tsc + 独立 demo | esbuild 双产物、无 Vite 依赖 |
| 测试 | vitest + Playwright 快照 | 15 文件 / 226 项单测与集成测试通过 + 真实宿主 DOM 冒烟；真实模型 E2E 改为人工 |

## 2. 模块级明细

| 模块 | 上游原有能力 | 本次修改 | 修改原因 |
|---|---|---|---|
| Prompt | `src/host/index.ts` 通过 `inject:["systemPrompt"]` + `systemPrompt.section(...)` 注入 `rich-ui:fence` 指令；`prompt-rich-ui/prompt.md` 为运行时加载文件 | 删除整条注入链；删除 `prompt-rich-ui/`；技术内容整理为 `docs/PROTOCOL.md` / `docs/COMPONENTS.md`（离线文档，不被运行时读取） | 模型行为必须中立 |
| 行为指导 | prompt 中包含"默认使用""集合优先卡片""validate 后发送"等大量行为指令 | 全部移除；任何文档不得自动进入模型上下文 | 同上 |
| Validator | `rich_ui_validate`（描述含行为指导） | `rich_msg_validate`：仅描述输入/输出/无副作用；保留严格校验与错误信息 | 工具 API 保持技术性 |
| Tool Bridge | 无（仅校验） | 新增 `rich_msg_publish`、`ArtifactStore`、只读 HTTP 路由、`ref` 引用协议、浏览器端解析器 | 支持 Tool 通道且不直接展示工具阶段内容 |
| Fence 发现 | DOM MutationObserver；`rich-ui` 语言；仅 `assistant-step` 祖先 | 保留扫描框架；新增语言别名 `rich-msg`、严格 payload 特征、Chat Snapshot 校验、finality 状态机、推理排除、流式回撤、引用解析、失败关闭 | 满足"只渲染最终回答" |
| 渲染器 | RichResponse + blocks + primitives + EntityList/Details + persistence | 直接复用；命名空间/存储前缀改为 `dsh-rich-msg`；保留既有可访问性实现 | 复用成熟实现 |
| 主题 | `rich-ui.css`（67KB，自有 token + 部分 `--dsw-*` 桥接） | 保留组件样式；新增 `client/host-theme.css` 完整桥接（明/暗/375–480px） | Hybrid 视觉要求 |
| Actions | `[rich-ui-action]` 信封 + 会话捕获 + 大小上限 | 前缀改为 `[rich-msg-action]`；保留白名单/上限/会话捕获/不记录 payload | 品牌统一 |
| 实体侧栏 | `entity-tab.tsx` 注册右侧栏 tab | 保留，改为可选注入；标识符改为 `dsh-rich-msg/entity` | 保留能力 |
| 构建 | Vite 配置 + TS 检查 + 两个 vite build | `scripts/build.mjs`：esbuild 打 Host ESM 与 Client CJS，再包 ModuleLoader；CSS 作为文本模块注入 | 摆脱 Vite/npm 构建依赖，与宿主加载协议一致 |
| 测试 | vitest 单测（schema/UI/host）+ Playwright 快照 | 保留 schema/evaluator/UI/persistence/entityTab 测试；新增 protocol/artifacts/tools/route/neutrality/chat-view/fence-claim/dom-renderer/artifact-resolver 测试；Playwright 快照移除，改为宿主冒烟 + 人工 E2E | 覆盖新链路、不虚构验证 |
| 文档 | README + 内部 docs + 运行时 prompt | 重写 README + 8 份技术文档 | 交付要求 |
| 包清单 | `@kyoukisu/dsh-rich-ui` | `dsh-rich-msg` | 独立项目命名 |

## 3. 保留的上游能力

- RichSpec v1 Schema 与严格校验（`src/core/schema.ts`）
- 安全表达式求值（`src/core/evaluator.ts`）
- 流式前缀解析（`src/core/partial.ts`）
- 全部 React 组件：布局、文本、实体、图表、表格、指标、媒体、流程、控件、逻辑
- 图片灯箱、图库、popover/tooltip、实体详情面板、右侧栏实体 tab
- 控件状态持久化（命名空间调整）
- 可访问性处理（aria、键盘、读屏标签）

## 3.1 验证状态

- 已通过：`tsc --noEmit`（0 错误）、`vitest run`（15 文件 / 226 项）、隔离 profile 真实宿主加载与 DOM 冒烟、0.1.1 事件驱动压力验证。
- 未完成（按用户要求停止自动化，改人工）：真实模型对话的 Fence 通道与 Tool Bridge 引用端到端验证。
- 未验证：Android WebView、多标签页并发、超长历史压测、宿主升级后的 DOM 契约。

## 4. 明确不做的事

- 不注册任何 prompt / persona / skill / agent preset；
- 不通过工具描述或初始化代码影响模型行为；
- 不修改 DSH 主程序；
- 不接管宿主 Markdown 渲染；
- 不在工具行渲染富内容。
