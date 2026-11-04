# ARCHITECTURE

本文件说明 dsh-rich-msg 的分层、生命周期与关键设计取舍。所有结论基于本机安装的 `@deepseek-ai/dsh@0.2.2-alpha.2` 实际源码/类型与真实宿主验证，不是对 DSH 未来 API 的假设。

## 1. 分层

```
┌──────────────────────────────────────────────────────────────┐
│ Host（Node ESM, lib/index.js）                                │
│  · tools.register(rich_msg_validate / rich_msg_publish)       │
│  · ArtifactStore（会话作用域、TTL、容量、淘汰）                 │
│  · ctx.inject(['webServer']) → 只读 GET 路由（可选）           │
└───────────────▲──────────────────────────────────────────────┘
                │ session log（工具调用参数 + 工具结果）
┌───────────────┴──────────────────────────────────────────────┐
│ Client（Browser ModuleLoader bundle, lib/client.js）          │
│  · ChatView    ← ctx.uiConversation.binding(session).target('chat') │
│  · FenceRenderer  DOM 扫描 + 最终性判定 + React root 挂载      │
│  · ArtifactResolver  会话日志优先 / HTTP 路由兜底              │
│  · ActionRelay  → ctx.sessions.scope(session).get('conversation').send │
└───────────────▲──────────────────────────────────────────────┘
                │ 同一份 RichSpec / 同一套 React 组件
┌───────────────┴──────────────────────────────────────────────┐
│ Renderer（React，框架无关于 Cordis）                            │
│  RichResponse → 布局/数据/媒体/流程/控件/逻辑                   │
└──────────────────────────────────────────────────────────────┘
```

依赖方向严格单向：`host → shared ← client`，`client → ui → core`。`core` 不依赖 React，`ui` 不依赖 Cordis 或宿主服务。

## 2. 宿主侧生命周期

- 插件形态：npm 包 + `package.json.dsh.bundle.patch` 指向 `cordis.patch.yml`，由 profile 的 `dsh.profile.bundles` 激活。
- `apply(ctx, config)` 只做三件事：
  1. `ctx.tools.register(...)` 注册两个工具；
  2. 创建 `ArtifactStore`；
  3. `ctx.inject(['webServer'], ...)` 可选注册只读路由。
- 所有资源登记在 `ctx.effect(() => disposeAll, 'dsh-rich-msg: host resources')` 中；fiber 卸载时逆序释放、清空 Artifact、移除路由。
- `apply` 同时返回 disposer，兼容把返回值当日志清理函数的宿主。

**不变量**：`apply` 不读取 `ctx.systemPrompt`、`ctx.persona`、`ctx.skill`、`ctx.agentPreset` 等任何模型行为服务。测试用 Proxy 记录属性访问并静态扫描源码双重保证（`tests/host/neutrality.test.ts`）。

## 3. 客户端侧生命周期

`apply(ctx)`：

1. 构造 `ChatView`（读取 Chat Snapshot）与 `ArtifactResolver`、`ActionRelay`；
2. 通过 `ctx.inject(['uiConversation'])` 延迟绑定 Snapshot 服务（服务不存在时自动降级）；
3. 通过 `ctx.inject(['slots'])` 可选安装右侧栏实体详情页；
4. 安装一次性样式；安装 Fence 渲染器；
5. 全部登记进 `ctx.effect(() => dispose, 'dsh-rich-msg: browser resources')`。

卸载时：断开 MutationObserver、取消 Snapshot 订阅、unmount 所有 React root、恢复所有被隐藏的源码块、移除 `<style>`、清理缓存。卸载路径由单测与真实宿主验证覆盖。

## 4. Fence 渲染（通道 A）

### 4.1 为什么是 DOM 适配器

已核实的 DSH 客户端扩展点：

| 扩展点 | 能力 | 结论 |
|---|---|---|
| `conversation.chat.node`（keyed by ChatNodeKind） | 可整体替换 `assistant-step` 渲染器 | 会重写推理折叠、文本选择、流式稳定性等宿主行为，侵入过大 |
| `conversation.chat.reasoning.body` | 仅推理正文 | 与正文无关 |
| `slots` / `uiRenderer` | 通用 Slot 体系 | **没有** fenced-code 渲染器注册表 |
| `MarkdownText`（ui-primitives） | Markdown 渲染 | 只暴露链接/图片/文件委托，没有代码块扩展点 |
| DOM | 宿主真实输出 | 官方 genui 类插件的既有技术，可失败关闭 |

因此沿用"只读 DOM 适配 + 相邻挂载"的技术，但用 Chat Snapshot 补齐上游缺失的**最终消息判定**。

### 4.2 判定流程

```
候选代码块（.md-code-block / .code-block / [data-code-block-content]）
 ├─ 在 [data-rich-msg-root] 内？ → 跳过
 ├─ 最近的 [data-chat-flow-kind] 不是 assistant-step？ → 跳过
 ├─ 语言标签：显式非 rich-msg/rich-ui → 跳过
 │           通用标签（宿主把未知语言本地化）→ 仅接受严格 payload 特征
 │           （version:1 + nodes 数组，或合法 ref 文档）
 ├─ Chat Snapshot 可用？
 │   ├─ 该行 node.kind === 'assistant-step'？
 │   ├─ 围栏文本属于 text 块（不是 reasoning 块）？
 │   ├─ finality：该 assistant 步骤是整轮最后一个且其后无 tool-call？
 │   │     running → streaming-final（可预览）
 │   │     settled → final
 │   │     否则  → not-final（不渲染）
 │   └─ 若 snapshot 不可用 → 保守降级：仅已稳定行 + 不预览流式
 └─ 通过 → 校验/挂载；任一环节失败 → 保留宿主原生代码块
```

**关键点**：`assistant-step` 在 DSH 中既包含推理过程，也包含工具调用前后的中间叙述，所以"祖先匹配"不能证明它是最终回答。Snapshot 判定解决了这一点，并且当模型在后续步骤调用工具时，已挂载的流式预览会被**自动回撤**（恢复到原生代码块）。

### 4.3 挂载与重挂载

- 每个源码块对应一个独立 `createRoot` 容器，容器插在源码块之后并设置 `hidden` 隐藏源块；
- 复用条件：raw 文本、会话、streaming 状态、行 owner、模式（spec/ref/diagnostic）全部一致，避免每个 token 重建整棵树；
- 宿主 reconcillation 可能移动节点：每次扫描校验 `source.nextSibling === container`，需要时重新插入；
- 渲染异常由 `RenderBoundary` 捕获：隐藏容器、恢复源码块，不产生无限重试；
- 卸载：逐个 unmount、移除容器、恢复 `source.hidden`。

### 4.4 持久化

控件状态使用 `sessionStorage`，key 由 `[插件, 会话 id, 行锚点, 块序号, ref]` 组成；只持久化 slider/switch/select/tabs 等声明式控件，输入框、日期、Action payload 一律不写。存储失败静默禁用。

## 5. 工具桥接（通道 B）

见 [TOOL-BRIDGE.md](TOOL-BRIDGE.md)。

## 6. 为什么不注册 tool view

DSH 提供 `tool.call.toolview` 按工具名键控的渲染槽。刻意**不**使用它来渲染富内容：工具阶段的内容不应冒充最终回答。工具行保持宿主默认呈现（名称、参数、结果摘要），富内容只在最终回答引用处出现。

## 7. 构建与加载

- Host：esbuild 打包为 ESM（平台 node，仅 Node 内置依赖）；
- Client：esbuild 打包为 CJS 主体，由构建脚本包进
  `window.__ModuleLoader__.load({ id, factory(require) { ... } })`；
- `react` / `react/jsx-runtime` / `react-dom` / `react-dom/client` 保持 external，由 Web 外壳静态模块表提供；其余（含 lucide-react）打进 bundle；
- CSS 作为文本模块打入 JS，由插件在运行时注入一个带命名空间属性的 `<style>`，卸载时移除。

## 8. 已知取舍

1. **DOM 契约是观测契约，不是稳定 API**：宿主升级可能改变类名/标记。渲染器在所有判定点失败关闭（保留代码块），并在升级后需要重新跑真实宿主验证。
2. **Snapshot 不可用时无法区分推理**：降级模式只保证"不渲染流式内容 + 仅 stable 行"，无法排除推理块。文档与代码都显式记录了这一限制；真实 Web 组合中 `uiConversation` 必然存在。
3. **引用解析优先走会话日志**：这样离线、刷新、宿主重启后仍可渲染历史回答；HTTP 路由只覆盖工具结果被压缩等边缘情况。两者都失败时显示可读诊断，不会静默丢内容。
4. **不接管宿主 Markdown**：普通代码块、LaTeX、文件链接、图片灯箱等全部保持宿主行为。
