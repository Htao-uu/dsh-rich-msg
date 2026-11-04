# dsh-rich-msg

一个独立、无模型行为倾向的 **DSH 富内容消息渲染引擎**（Rich Message Renderer）。

它把结构化 JSON 协议渲染成美观、可交互、跟随宿主主题的消息内容，并提供两条互不耦合的输出通道：

| 通道 | 数据来源 | 最终展示位置 |
|---|---|---|
| **A. Markdown Fence** | 最终 Assistant 回答正文中的 ```rich-msg 代码围栏 | 原位替换该代码块 |
| **B. Tool Bridge** | 工具调用 `rich_msg_publish` 暂存的结构化内容 + 最终回答中的 `ref` 引用 | 最终回答中引用所在的位置 |

两条通道共用同一套 Schema、校验器、React Renderer 与主题适配层。

本项目是**纯技术渲染层**：它不注入 system prompt / developer prompt / persona / skill，不规定模型何时使用富内容，也不改变模型回答风格。是否使用、何时使用、如何组织内容，完全由使用者自己的 Persona、Prompt 或上层应用决定。

---

## 设计目标

1. **协议先行**：先定义并校验数据结构，再渲染；非法数据永不执行、永不修补。
2. **双通道、单渲染器**：Fence 与 Tool 两种入口最终都落到同一个 `RichResponse`。
3. **只渲染最终回答**：推理过程、工具调用阶段、中间步骤中的内容不会被当成最终 UI 展示。
4. **宿主优先的视觉**：组件保留自己的布局语言，颜色、字体、背景、边框、圆角、阴影全部取自 DSH 主题变量；明暗主题与移动端开箱即用。
5. **安全默认**：声明式 JSON、无 HTML/JS 执行、无 eval、URL 白名单、Action 白名单、大小/深度/数量限制、Session 隔离。
6. **可卸载、可重挂载**：所有 React root、样式、监听器、路由、缓存都有明确的生命周期。

---

## 架构

```
dsh-rich-msg
├── Host Integration（Node / Cordis 插件）
│   ├── lib/index.js         插件入口：注册工具、装配 Artifact Store、可选 HTTP 读取路由
│   ├── Artifact Store       会话作用域、带 TTL / 容量上限 / 淘汰策略的内存存储
│   └── Final Message Bridge 由「工具暂存 + 最终回答引用」构成的两段式桥接
│
├── Protocol（框架无关）
│   ├── core/schema.ts       RichSpec v1 定义与严格校验
│   ├── core/evaluator.ts    安全表达式求值（无 eval）
│   ├── core/partial.ts      流式前缀解析（只呈现已闭合且合法的部分）
│   └── shared/protocol.ts   Fence 语言、ref 协议、Action 信封、DOM 标记、上限
│
├── Renderer（React）
│   ├── ui/RichResponse.tsx  节点调度、交互状态、持久化
│   ├── ui/blocks/*          Chart / Table / Metrics / Media / Layers / Code / Field
│   ├── ui/EntityList.tsx    实体列表与详情
│   └── ui/primitives/*      Popover / Tooltip / Lightbox / Gallery 等基础件
│
├── Client Integration（浏览器）
│   ├── client/dom-renderer.tsx  Fence 发现、最终消息判定、挂载/回滚
│   ├── client/chat-view.ts     读取 Chat Snapshot：最终性、推理排除、Artifact 索引
│   ├── client/artifact-resolver.ts  ref 解析（会话日志优先，HTTP 路由兜底）
│   ├── client/actions.ts        交互事件 → 用户消息
│   └── client/entity-tab.tsx    可选：右侧栏实体详情页
│
├── Theme
│   └── client/host-theme.css    DSH 主题变量 → 组件 token（明/暗/移动端）
│
└── Tests / scripts
```

详细设计见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

---

## 两条输出通道

### A. Markdown Fence

最终 Assistant 回答中：

````markdown
```rich-msg
{"version":1,"nodes":[{"type":"text","content":"Hello"},{"type":"stat","label":"Score","value":42}]}
```
````

渲染器会：

1. 只处理 **最终回答** 的 `assistant-step` 行，并用 Chat Snapshot 校验：该步骤是整轮对话的收尾回答，且其后没有工具调用；
2. 通过 Snapshot 中该步骤的内容块区分 **正文** 与 **推理**：推理块中的围栏永不渲染；
3. 校验 JSON；非法内容保持原生代码块（流式中）或显示诊断卡片（已稳定）；
4. 在原位置挂载独立的 React root 并隐藏源码块，卸载时完整还原。

`rich-ui` 作为上游兼容别名同样被接受。普通代码块、其他语言、工具行内容完全不受影响。

### B. Tool Bridge

工具调用负责**准备**内容，最终回答负责**决定是否呈现**：

```
模型调用 rich_msg_publish({document})
   → Host 校验、存入会话作用域 Artifact Store
   → 返回 {ok:true, id:"rm_…", kind, summary}
模型在最终回答中写：
```rich-msg
{"version":1,"ref":"rm_…"}
```
   → 浏览器从会话日志中的工具调用还原文档（主路径）
   → 或读取 Host 的只读路由（兜底）
   → 在最终回答的引用位置渲染
```

如果最终回答没有引用该 id，内容不会被显示；工具阶段本身不渲染任何富内容。

详细数据流与验证方法见 [docs/TOOL-BRIDGE.md](docs/TOOL-BRIDGE.md)。

---

## 支持的能力

组件与字段的完整清单见 [docs/COMPONENTS.md](docs/COMPONENTS.md)，数据协议见 [docs/PROTOCOL.md](docs/PROTOCOL.md)。

- **布局**：`stack` / `row` / `grid` / `card` / `carousel` / `divider` / `meta`
- **文本**：`text`（行内 code/bold/链接/实体 chip）、`callout`、`code`
- **对象**：`entity-list` / `entity-ref` / 实体详情面板 / 图库 / 图片灯箱 / `image` / `image-group` / `gallery`
- **数据**：`stat` / `progress` / `status` / `table`（排序、筛选、状态色、进度列）/ `chart`（bar/line/area/donut/scatter）/ `computed`
- **流程**：`diagram` / `layers`
- **媒体**：`image` / `video` / `audio` / `popover` / `tooltip`
- **控件**：`input` / `select` / `slider` / `switch` / `checkbox` / `radio` / `segmented` / `tabs`
- **逻辑**：`expression` / `conditional` / 本地 Action（set/toggle/reset/open-entity/close-entity/copy/open-url/send-message）

## 工具接口

| 工具 | 输入 | 输出 | 说明 |
|---|---|---|---|
| `rich_msg_validate` | `{document: string}` | `{valid, error?, title?, nodes?, entities?}` | 只做 Schema 校验，无副作用 |
| `rich_msg_publish` | `{document: string}` | `{ok, id?, kind?, summary?, error?}` | 校验并存入当前会话的 Artifact Store，返回稳定引用 id |

工具描述只说明输入、输出与副作用，不包含任何"何时应该使用"的行为指导。

## 主题

- 全部颜色/字体/圆角/阴影来自 DSH 的 `--dsw-*` 令牌；
- 同时支持浅色与深色主题（跟随 `data-ds-dark-theme` 与上游 `data-theme="dark"`）；
- 组件不覆盖宿主消息气泡、侧边栏或其它插件的布局；
- 移动端 390px 宽度下保持可读。

详见 [docs/THEME.md](docs/THEME.md)。

## 上游项目与许可证

- 本项目基于 **kyoukisu/dsh-rich-ui**（MIT）的源码进行独立开发与重构：保留了其成熟的 RichSpec Schema、表达式求值器、React 组件与视觉实现，重写了宿主集成、消息判定、工具桥接、主题桥接与文档，并移除了运行时 Prompt 注入。
- 上游版权声明保留在 [LICENSE](LICENSE)（MIT, Copyright (c) 2026 kyoukisu）。
- 图标来自 [lucide-react](https://lucide.dev)（ISC），详见 [docs/THIRD-PARTY.md](docs/THIRD-PARTY.md)。
- 本项目与上游作者无隶属、合作或背书关系；名称 `dsh-rich-msg` 用于区分衍生项目。
