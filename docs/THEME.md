# THEME

## 1. 目标

组件保留自己的布局语言（卡片、行、图库、图表），但颜色、字体、背景、边框、圆角、阴影全部服从宿主 DSH 的主题系统；浅色/深色/移动端开箱即用，不引入与宿主无关的独立配色。

## 2. 实现方式

`src/client/host-theme.css` 在组件样式之后加载，把 DSH 令牌映射到渲染器自己的 `--ru-*` 变量：

| 渲染器变量 | DSH 令牌 | 用途 |
|---|---|---|
| `--ru-bg` | `--dsw-alias-bg-layer-1` | 页面/卡片底色 |
| `--ru-surface` / `--ru-surface-2` | `--dsw-alias-bg-layer-2` / `-3` | 嵌层表面 |
| `--ru-ink` / `--ru-ink-soft` / `--ru-muted` / `--ru-faint` | `--dsw-alias-label-primary` / `-secondary` / `-tertiary` / `-caption` | 文本层级 |
| `--ru-border` / `--ru-border-strong` | `--dsw-alias-border-l1` / `-l2` | 描边 |
| `--ru-accent` | `--dsw-alias-state-business-primary` | 强调色 |
| `--ru-success/warning/danger` | `--dsw-alias-state-success/warn/error-primary` | 语义状态 |
| `--ru-link` | `--dsw-alias-link` | 链接 |
| `--ru-code-bg` | `--dsw-alias-markdown-code-block` | 代码底 |
| `--ru-radius` / `--ru-radius-sm` | `--dsw-radius-lg` / `-md` | 圆角 |
| `--ru-shadow` | `--dsw-elevation-soft` | 阴影 |
| `font-family` | `--dsw-font-family` | 字体 |
| `font-size` | `--dsh-content-font-size` / `--dsw-font-markdown-base` | 字号 |

软色（`--ru-*-soft`）用 `color-mix(in srgb, <语义色> N%, transparent)` 派生，自动跟随主题。

## 3. 深色模式

- DSH 用 `data-ds-dark-theme` 标记深色（可能挂在 `body` 或 `html`），本插件两种位置都识别；
- 同时兼容上游 `data-theme="dark"`；
- 深色下额外覆盖：底色、嵌层、文本、边框、图表色、代码底、阴影、`color-scheme`。

## 4. 响应式

- 容器 `max-width:100%`、`min-width:0`，绝不撑破消息列；
- `@media (max-width:480px)` 缩小字号与圆角；
- 图表按容器宽度重算画布；
- 表格横向滚动，不压缩列宽；
- 图库/灯箱在窄屏下改为单列。

## 5. 不做什么

- 不复制任何产品商标/专有视觉资产；
- 不覆盖 DSH 的消息气泡、侧边栏或其它插件布局；
- 不使用 `!important` 强改宿主样式；
- 所有样式规则限定在 `[data-rich-msg-root]` / `.rich-ui` 下。

## 6. 验证

开发期已在隔离 profile 的真实宿主中截取浅色桌面 / 深色桌面 / 390px 移动端画面（本地开发证据，未纳入仓库）。新增/修改组件样式后，应在真实宿主中按 `docs/DEVELOPMENT.md` 第 5.2 节人工复核两套主题与窄屏表现。
