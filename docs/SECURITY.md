# SECURITY

## 1. 威胁模型

富内容来自**不可信输入**：模型输出、其它插件通过工具提交的 JSON。攻击面包括：

- 注入 HTML/脚本（XSS）；
- 原型污染（`__proto__` 等）；
- 资源耗尽（超大/超深/超多节点）；
- 危险 URL（`javascript:`、`data:`、带凭据 URL）；
- 越权交互（模型数据触发任意工具/会话操作）；
- 跨会话数据泄漏（Artifact/状态串会话）；
- DOM/内存泄漏（重复挂载、未卸载 root）。

## 2. 防护措施

### 2.1 只接受声明式 JSON

- Fence 内容与工具参数都必须是 JSON；解析入口拒绝 `__proto__` / `constructor` / `prototype` 键。
- 根值必须是对象；`parseRichSpec` 关闭未知字段，类型/枚举/范围逐项校验。
- 不解析 HTML、不执行 JS、不使用 `eval` / `new Function`。
- 表达式由自带解析器求值（`core/evaluator.ts`），支持标量、`{state}` 与有界算子树，**不支持**任意源码。

### 2.2 资源上限

| 限制 | 值 |
|---|---|
| 单文档字符数 | 256,000 |
| JSON 深度 | 48 |
| JSON 值数量 | 20,000 |
| 字符串长度 | 16,384（单字段）/ 1,000,000（文档累计） |
| 数组长度 | 1,000 |
| 组件节点数量 | 1,000 |
| 表达式深度/节点数 | 24 / 256 |
| 持久化 state key | 128 |
| 单次求值步骤 | 2,048 |

超限时返回可读错误，不渲染、不修补。

### 2.3 URL 校验

- 仅允许 `http:` / `https:`；
- 拒绝用户名/密码内嵌；
- 拒绝控制字符与超长 URL（>2048）；
- 图片、链接、媒体、open-url action 全部走同一校验。

### 2.4 Action 白名单

允许：`set` / `toggle` / `reset` / `open-entity` / `close-entity` / `copy` / `open-url` / `send-message`。

- `set` / `toggle` 的值必须落在共享 `stateKey` 的 domain 内；
- `open-url` / `copy` 等副作用只由**用户点击**触发；
- 交互事件统一序列化为 `[rich-msg-action] {action,payload}` 用户消息，长度上限 32,000；超限丢弃；
- 不允许富内容直接调用任意 DSH 工具；`send-message` 只是普通用户消息，由模型决定后续行为；
- 不记录 Action payload（可能含表单隐私）。

### 2.5 会话隔离

- Artifact 按 `sessionId` 存储与查询，不匹配等价于不存在；
- HTTP 路由要求 `?session=` 且校验格式，跨会话返回 404；
- 控件状态 key 包含会话 id；
- Fence 渲染器只解析当前 viewed session 的 Snapshot。

### 2.6 DOM 与生命周期

- 只做加法：在源码块旁插入自有容器，用 `hidden` 隐藏源块；不删除/移动宿主节点；
- 卸载时 unmount 全部 root、移除容器、恢复 `hidden`、移除样式；
- MutationObserver 忽略自己容器内的变更，避免自触发循环；
- `RenderBoundary` 捕获渲染异常：隐藏容器、恢复源码块、不重试同一失败树；
- Session 切换时移除不属于当前会话的挂载。

### 2.7 宿主与插件边界

- 不修改 DSH 主程序；
- 不注册 prompt/persona/skill；
- 工具描述不含行为指导；
- 不写宿主日志中的内容数据。

## 3. 隐私

- Artifact Store 仅内存、会话内、不可枚举（无列表接口）；
- HTTP 路由响应 `no-store`，不写访问日志内容；
- 错误信息截断到 1000 字符；
- 不在 `console` 输出 payload / 表单值。

## 4. 已知限制

1. 富内容来自模型，其**文字内容**本身可能不准确或带有误导性；渲染器只保证"不执行代码/不注入 HTML"，不保证内容真实性。
2. HTTP 路由与本插件同源；同源页面若被 XSS 攻破，理论上可读取已知 id + session 的 artifact。防线是宿主自身的同源/鉴权（DSH Web 使用进程 token）。
3. `sessionStorage` 持久化在同一浏览器标签内可见；不存储敏感输入。
4. 渲染器依赖宿主 DOM 契约，宿主升级可能改变标记；变化时失败关闭为原生代码块。
5. 进程内 Artifact Store 不跨进程共享；多实例部署时历史引用仍可依赖会话日志路径。
