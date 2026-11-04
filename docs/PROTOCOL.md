# PROTOCOL

数据协议、校验规则、引用协议与交互信封。**本文件是技术参考，不是运行时 Prompt，也不会被插件自动注入任何模型上下文。**

## 1. 文档根

```json
{
  "version": 1,
  "title": "optional string",
  "entities": [],
  "initialState": {},
  "nodes": []
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `version` | ✅ | 必须是数字 `1` |
| `nodes` | ✅ | 节点数组，1–1,000 项 |
| `title` | ❌ | 文档标题（封面/摘要位置使用） |
| `entities` | ❌ | 实体数组，被 `entity-list` / `entity-ref` / `[[id]]` 引用 |
| `initialState` | ❌ | 控件初始状态：`Record<stateKey, Scalar>` |

未知字段直接拒绝整份文档；重复 id、悬空引用、非法枚举、越界数字同样拒绝。

## 2. 值类型

- `Scalar`：string | 有限 number | boolean | null
- `KEY`：`^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$`，且不得是 `__proto__`/`prototype`/`constructor`，不得是敏感词（password/token/secret/api_key 等）
- `URL`：仅 http/https，≤2048 字符，无内嵌凭据、无控制字符
- `Expr`：`Scalar` | `{"state":"KEY"}` | `{"op":"OP","args":Expr[]}`
  - 运算符：`add sub mul div mod min max pow eq ne lt lte gt gte and or not if`
  - 深度 ≤24，节点 ≤256，求值步数 ≤2048
  - 非有限结果、非法比较 → 求值失败（渲染为可读错误，不崩溃）

## 3. 节点

完整字段见 [COMPONENTS.md](COMPONENTS.md)。节点公共规则：

- 每个节点可有唯一安全 `id`；
- 布局容器字段是 `children`（不是 `items`）；
- `items` 只出现在 `meta` 与 `layers` 内部；
- 未知节点类型 → 整份文档拒绝。

## 4. Fence 协议（通道 A）

### 4.1 语言标记

````markdown
```rich-msg
{ ... JSON ... }
```
````

- 主语言：`rich-msg`
- 兼容别名：`rich-ui`（上游协议）
- 其他显式语言（`json`、`ts`、`python`…）永不被接管；
- 宿主会把未知语言替换成本地化通用标签（"Code block"/"代码块"）。此时仅当 payload 通过严格文档特征（`version === 1` 且 `nodes` 为数组，或合法 ref 文档）才接管——普通 JSON 代码块保持为代码。

### 4.2 展示位置约束

- 只在 **最终 Assistant 回答** 中渲染；
- 推理块（reasoning）中的围栏永不渲染；
- 工具行、用户消息、上下文注入行中的内容永不渲染；
- 流式过程中只预览已经闭合且通过校验的部分；一旦该步骤被判定为"中间步骤"，预览会回撤为原生代码块。

### 4.3 非法文档

- 流式中：保持原生代码块；
- 已稳定：显示诊断卡片（错误原因 + 可复制的原始源码），不修复、不执行。

## 5. 引用协议（通道 B）

```json
{"version":1,"ref":"rm_0123456789abcdef0123"}
```

规则：

- 恰好两个字段：`version`（=1）与 `ref`；
- `ref` 匹配 `^rm_[0-9a-f]{20}$`；
- 仅出现在 `rich-msg` 围栏中；普通文本里的 id 不会触发渲染；
- 解析顺序：会话日志中的 `rich_msg_publish` 工具调用 → 宿主只读路由 `GET /rich-msg/artifact/<id>?session=<id>` → 诊断卡片；
- 未引用 = 不展示。

## 6. 交互 Action 协议

控件动作由用户点击触发，序列化为一条普通用户消息：

```text
[rich-msg-action] {"action":"set","payload":{"key":"amount","value":100}}
```

- 前缀常量：`[rich-msg-action]`
- 总长度上限 32,000；action 名 1–256 字符；payload 必须可 JSON 序列化；
- Action 白名单：`set` / `toggle` / `reset` / `open-entity` / `close-entity` / `copy` / `open-url` / `send-message`
- 富内容自身不能直接调用 DSH 工具；`send-message` 只是把文本发回对话；
- 会话在**挂载时**捕获，点击时不会重新解析"当前会话"；
- 发送失败只记录一条无 payload 的警告。

## 7. 状态与持久化

- 控件可声明 `stateKey`；同一文档内共享同一 key 的控件必须具备相同的值域（slider 的 min/max/step、option 集合或 tab id）；
- `initialState` 的初值必须落在值域内；
- `conditional` 按 `when` 表达式切换分支；
- 持久化仅限 `sessionStorage`，key 含插件名、会话 id、行锚点、块序号；只保存 slider/switch/select/tabs 等声明式控件；输入框、日期、Action payload 不持久化；存储失败静默禁用。

## 8. 限制汇总

| 项 | 值 |
|---|---|
| 文档字符数 | 256,000 |
| JSON 深度 | 48 |
| JSON 值数量 | 20,000 |
| 单字符串 | 16,384 |
| 数组 | 1,000 |
| 节点 | 1,000 |
| 表达式深度 / 节点 | 24 / 256 |
| 求值步数 | 2,048 |
| `initialState` key | 128 |
| Action 消息 | 32,000 字符 |
| Artifact id | 每会话 ≤64，TTL 6h，最多 256 会话 |

## 9. 版本兼容

- 当前仅支持 `version: 1`；
- `rich-ui` 语言别名与上游数据协议兼容（字段集合以本仓库 `src/core/schema.ts` 为准）；
- 未来版本会通过 `version` 显式区分，未知版本整份拒绝。
