# COMPONENTS

RichSpec v1 节点字段参考。`?` 表示可选字段（不是 JSON 语法）。字段未列出者一律禁止。

## 根与实体

**Root**：`{version:1, nodes:Node[], title?:string, entities?:Entity[], initialState?:Record<KEY,Scalar>}`

**Entity**：`{id:KEY, kind:string, title:string, subtitle?, description?, image?:URL, images?:(URL|Image)[], facts?:{label:string,value:Scalar}[], cast?:{name:string,role?,image?:URL}[], sources?:{title:string,url:URL}[], related?:KEY[], badge?:{label:string,tone?}, thumbShape?:"poster"|"square"|"landscape", galleryLayout?:"paired"|"single"}`

- `Image` = `{src:URL, alt:string, caption?:string}`
- `badge.tone`：`success | info | warning | danger | accent`
- `thumbShape` 控制行预览形状；`galleryLayout:"single"` 为单图带说明的图库
- 所有 `related`、`entity-ref`、`open-entity` 目标必须存在

## 文本

**text**：`{type:"text", content:Expr, variant?:"body"|"title"|"subtitle"|"caption"}`

行内仅识别：`\`code\``、`**bold**`、`[label](https://…)`、`[[entityId]]`。其他标记按字面显示；链接必须绝对 http(s)。

**callout**：`{type:"callout", content:Expr, tone?:"info"|"success"|"warning"|"error"}`

**code**：`{type:"code", code:string, language?:string, title?:string, lineNumbers?:boolean}`

**icon**：`{type:"icon", name:string, size?:number, tone?:TONE}`（8–128；Lucide 名称）

## 布局

| 节点 | 字段 |
|---|---|
| `stack` / `row` / `grid` / `card` | `{children:Node[], gap?:0-128, title?:string}`；`grid`/`row` 支持 `columns`（1–12） |
| `carousel` | `{children:Node[]}` |
| `divider` | `{label?:string}` |
| `meta` | `{items:[{text:string,icon?:string}]}` |
| `popover` | `{label:string, children:Node[]}` |
| `tooltip` | `{label:string, text:string}` |

## 数据

**stat**：`{label:string, value:Expr, delta?:Expr, deltaLabel?:string, hint?:string, tone?:"success"|"warning"|"danger"|"accent", icon?:string}`

**progress**：`{value:Expr, max?:number, label?:string, tone?:"success"|"warning"|"danger"|"info"|"accent", showValue?:boolean}`

**status**：`{label:string, tone?:"muted"|"success"|"warning"|"danger"|"info"|"accent"}`

**computed**：`{expr:Expr, label?:string}`

**table**：`{columns:[{key,label,align?:"left"|"right"|"center", format?:"text"|"number"|"status"|"progress", tones?:Record<string,TONE>, max?:number, tone?:TONE}], rows:Record<KEY,Expr>[], sortable?:boolean, filterable?:boolean, filterPlaceholder?:string, caption?:string, empty?:string}`

- 列 key 唯一；行对象的字段必须对应列 key；缺格显示 "—"
- `format:"number"`：千分位 + 右对齐
- `format:"status"`：按 `tones`（按显示字符串索引）渲染状态 pill，未知值用 muted
- `format:"progress"`：0–`max`（默认 100）进度条
- `sortable` / `filterable` 为本地交互

**chart**：`{kind:"bar"|"line"|"area"|"donut"|"scatter", data?:{label:string,value:Expr}[], categories?:string[], series?:{label:string,values:Expr[]}[], points?:{x:number,y:number,label?:string}[], unit?:string, xUnit?:string, caption?:string}`

- `data` 用于单系列或 donut；donut 值必须非负
- `categories` + `series` 用于 2–6 个系列，`values` 长度必须等于 `categories`
- `scatter` 使用 1–200 个 `points`

## 对象与媒体

**entity-list**：`{entityIds:string[], layout?:"compact"|"feature"}`

**entity-ref**：`{entityId:KEY}`

**image**：`{src:URL, alt:string, caption?:string}`

**image-group**：`{alt:string, label?:string, presentation?:"button"|"gallery", src?:URL[], items?:Image[]}`（`src` 与 `items` 二选一）

**video**：`{src:URL, poster?:URL, title?:string, caption?:string}`（原生 controls，不自动播放，不支持第三方嵌入）

**audio**：`{src:URL, title?:string, caption?:string}`

**Gallery / 灯箱**：由 `images`、`image-group` 自动启用，支持键盘与读屏。

## 流程

**diagram**：`{steps:[{id:KEY,label:string,detail?:string,tone?:TONE,connector?:string,depth?:0|1|2}], direction?:"horizontal"|"vertical", caption?:string}`（1–12 步，id 唯一）

**layers**：`{layers:[{title:string, detail?:string, icon?:string, tone?:TONE, items?:[{label,detail?,icon?,tone?}], layers?:[Layer]}], caption?:string}`

- 最多 3 层嵌套；每层最多 6 个条目
- 同一层不能同时包含 `items` 与嵌套 `layers`

## 控件

| 节点 | 字段 |
|---|---|
| `input` | `{stateKey:KEY, label?, placeholder?, inputType?:"text"|"number"|"date"}` |
| `select` | `{stateKey:KEY, options:{label,value:Scalar}[], label?}` |
| `slider` | `{stateKey:KEY, min:number, max:number, label?, step?:number}`（min < max，step > 0） |
| `switch` | `{stateKey:KEY, label?}` |
| `checkbox` | `{stateKey:KEY, label:string}` |
| `radio` | `{stateKey:KEY, label?, layout?:"row"|"column", options:[{label,value}]}` |
| `segmented` | 同 radio，2–4 个短选项 |
| `tabs` | `{stateKey:KEY, tabs:[{id:KEY,label,icon?,children:Node[]}]}`（id 唯一） |
| `button` | `{label:string, action:Action, variant?:"primary"|"secondary"|"ghost", disabled?:Expr}` |
| `conditional` | `{when:Expr, children:Node[], elseChildren?:Node[]}` |

- 共享同一 `stateKey` 的控件必须接受同一值域；
- `input` 的日期接受 `YYYY-MM-DD` 或 `""`；文本/日期不持久化。

## Actions

| action | 字段 | 说明 |
|---|---|---|
| `set` | `{key:KEY, value:Expr}` | 本地状态更新（必须落在 domain 内） |
| `toggle` | `{key:KEY}` | 本地布尔反转 |
| `reset` | `{}` | 恢复默认值并清除持久化 |
| `open-entity` | `{entityId:KEY}` | 本地详情面板/侧栏 |
| `close-entity` | `{}` | 关闭详情 |
| `copy` | `{text:Expr}` | 点击后写入剪贴板 |
| `open-url` | `{url:URL}` | 点击后打开外部链接 |
| `send-message` | `{text:Expr}` | 作为普通用户消息发回对话 |

副作用（复制、打开链接、发消息）只在用户点击后发生；不会被模型数据直接触发。

## 可访问性

- 图表提供可访问表格/文本替代；
- 进度条暴露 `aria-valuenow`；
- 状态 pill 使用语义色 token；
- 控件有可读标签；
- 图片必须有 `alt`；
- 深色/浅色主题下保持对比度。

## 主题 token

组件自身不写死颜色：全部通过 `--ru-*` 变量，由 `client/host-theme.css` 映射到 DSH 的 `--dsw-*` 令牌。详见 [THEME.md](THEME.md)。
