# TOOL-BRIDGE

本文记录 Tool 输出通道的**真实数据流调查结论**、设计、实现边界与验证方式。所有 DSH 接口均来自本机安装的 `@deepseek-ai/dsh@0.2.2-alpha.2` 类型/源码，未使用任何未经验证的 API。

## 1. 需求与约束

- 工具调用负责准备富内容，**不能**直接把工具结果渲染成最终 UI；
- 最终 Assistant 消息负责**决定是否呈现**；
- 引用必须明确、可校验、会话隔离、可持久；
- 不允许凭空假设 DSH 存在"工具结果转发到消息气泡"的机制。

## 2. 调查结论（证据）

| 问题 | 结论 | 证据 |
|---|---|---|
| 工具如何注册 | `ctx.tools.register(ToolDefinition)`，返回 disposer | `@deepseek-ai/dsh-tools/lib/types/contracts.d.ts` → `ToolDefinition` |
| 工具执行上下文 | `execute(args, exec)`，`exec.agent.id` 是 SessionId，`exec.signal` 是取消信号 | 同上 → `ToolRunContext` / `Agent.id`（`dsh-agent/lib/types/types.d.ts`） |
| 工具返回值 | 必须返回 `output.schema` 校验的 canonical JSON；`output.render` 变成模型可见的 ContentBlock[] | `ToolOutputDefinition` |
| 工具结果对浏览器可见吗 | 可见：`ToolResultNode.content` 与配对调用的 `args` 都在 Chat Snapshot 中 | `dsh-client-ui-conversation/lib/types/client/contract/records.d.ts` |
| 浏览器如何读会话数据 | `ctx.uiConversation.binding(sessionId).target('chat').getSnapshot()` → `ChatSnapshot.nodes` | `dsh-client-ui-conversation/lib/types/client/conversation/assembly.d.ts`、`dsh-client-ui-chat/lib/types/client/contract/snapshot.d.ts` |
| 工具参数怎么读 | `ToolResultNode.args` 是 `PartialArguments`（`text(key)` / `value(key)` / `keys()`） | `dsh-util-values/lib/types/partial-json.d.ts` |
| 是否有 Artifact/消息附件机制 | 没有面向插件的稳定 Artifact 附加 API；会话日志本身是唯一持久事实来源 | 遍历 host/client 包类型未发现此类服务 |
| 宿主能否提供 HTTP 读取 | 能：`ctx.webServer.register({kind:'prefix', path, resource})`，请求/响应为 Fetch 风格 | `@deepseek-ai/dsh-host-webserver/lib/types/index.d.ts` → `WebServer.register` |

**关键结论**：工具调用及其参数/结果本身就是**持久化的会话事件**。浏览器端可以直接从 Chat Snapshot 重建"引用 id → 文档"，无需任何新的消息插槽或工具结果转发机制。这比依赖内存存储更可靠：刷新页面、宿主重启后历史回答仍能渲染。

## 3. 设计

### 3.1 发布（Host）

`rich_msg_publish({document})`：

1. 严格解析 JSON（大小上限 256,000；拒绝 `__proto__`/`constructor`/`prototype`）；
2. `parseRichSpec` 全量校验；
3. 从 `exec.agent.id` 取会话 id（无会话身份则拒绝）；
4. 写入 `ArtifactStore`（会话作用域、TTL 6h、每会话 64 个、最多 256 会话、LRU 淘汰）；
5. 返回 `{ok:true, id:"rm_…", kind, summary}`。

id 语法：`rm_` + 20 位小写十六进制（`crypto.randomBytes(10)`）。

存储**只存内存**：不写盘、不写日志、不跨会话共享；`dispose()` 全部释放。

### 3.2 引用（最终回答）

最终 Assistant 回答中，引用是一个独立的 fenced block：

````markdown
```rich-msg
{"version":1,"ref":"rm_0123456789abcdef0123"}
```
````

引用文档必须**恰好**包含 `version` 与 `ref` 两个字段，`version` 必须是 1，`ref` 必须匹配 id 语法；其他形态不视为引用。

### 3.3 解析（Client）

`ArtifactResolver`：

1. **会话日志优先**：遍历当前会话 Chat Snapshot 中的 `tool-call` 节点，筛出 `root.kind === 'tool-result'` 且未出错、结果文本 JSON 形如 `{ok:true,id}` 的记录；同一节点的 `root.args.text('document')`（或 `root.call.argsRaw`）提供原始文档；解析后建立 `id → {spec, kind, summary}` 索引。该索引按 Snapshot 身份缓存。
2. **HTTP 路由兜底**：`GET /rich-msg/artifact/<id>?session=<id>`。路由只读取 **同一 session** 的 artifact；缺失、越权、非法 id 一律 404；仅 GET/HEAD；`cache-control: no-store`。
3. **缺失**：渲染诊断卡片（`Unresolved rich-msg reference: rm_…`），不静默隐藏。

### 3.4 为什么"未被引用就不展示"

- 工具行由宿主默认渲染，插件没有在 `tool.call.toolview` 注册任何富内容视图；
- 富内容只在最终回答的 fence 位置创建 React root；
- 没有引用文档 = 没有渲染入口。

## 4. 生命周期与隔离

| 关注点 | 行为 |
|---|---|
| 会话隔离 | Artifact 记录 `sessionId`；`get(sessionId, id)` 不匹配即当作不存在；HTTP 路由要求查询参数携带同一个 session |
| 内存上限 | 单会话 64 条、最多 256 会话、TTL 6 小时；发布前 `prune()`，LRU 淘汰 |
| 宿主重启 | 内存存储丢失；浏览器仍可从会话日志还原历史引用（主路径） |
| 工具结果被压缩 | 会话日志路径缺失 → HTTP 路由兜底（宿主未重启时有效） |
| 插件卸载 | `dispose()` 清空所有会话与路由 |
| 页面刷新 | Snapshot 重新加载 → 索引重建 → 历史回答重绘 |
| 多标签页 | 各自从会话日志解析；控件状态仅标签内 `sessionStorage` |

## 5. 工具描述中立性

`rich_msg_publish` 的描述只说明：

- 输入是什么（`document: string`）；
- 会做什么（校验并存入当前会话 Artifact Store）；
- 返回什么（`ok/id/kind/summary` 或 `error`）；
- 返回 id 的**接口语义**（fence 中 `{"version":1,"ref":"<id>"}` 会被渲染器呈现）。

不包含"什么时候应该调用""优先使用""必须使用"等行为指令。测试 (`tests/host/tools.test.ts`) 对描述做禁用短语断言。

## 6. 已验证 / 未验证

- 已验证（单元/集成测试）：工具注册与 schema、会话隔离、TTL/容量、路由 404/405/HEAD、引用解析、中间步骤/推理/工具行不渲染。
- 未验证（待人工）：真实模型对话中 `rich_msg_publish` → 最终回答 `ref` → 渲染的完整链路。自动化 CDP 发送消息未打通，按交付要求改由人工按 `docs/DEVELOPMENT.md` 第 5.3 节验证。
- 未验证：跨进程集群部署（当前 Artifact Store 是进程内内存）；宿主若未来改变工具结果投影结构需要重新验证解析路径。
- 不支持：让富内容直接调用任意 DSH 工具；交互只能通过 `send-message` action 变成普通用户消息。
