# dsh-rich-msg

DeepSeek Harness（DSH）的富内容消息渲染插件：把声明式 JSON 渲染成跟随宿主主题、可交互的消息内容。

## 功能

- **双输出通道**：Markdown fence（```rich-msg，兼容上游 `rich-ui`）与 Tool Bridge（`rich_msg_publish` 暂存 + 最终回答 `ref` 引用）；两条通道共用同一渲染器。
- **只渲染最终回答**：推理过程、工具调用阶段、中间步骤中的内容不渲染；工具暂存内容只有被最终回答明确引用后才显示。
- **组件**：布局（stack/row/grid/card/carousel/divider/meta）、文本与 callout/code、实体列表与详情、图库与图片灯箱、卡片指标/进度/状态/表格（排序筛选）/图表（bar/line/area/donut/scatter）、流程 diagram、分层 layers、图片/视频/音频、popover/tooltip、输入/选择/滑块/开关/复选/单选/分段/tabs、条件渲染与安全表达式。
- **交互**：本地 set/toggle/reset、复制、打开链接、发消息回传；控件状态按会话持久化。
- **主题**：颜色/字体/圆角/阴影取自 DSH 主题变量，支持浅色、深色与 390px 移动端。
- **安全**：严格 Schema 校验、无 HTML/JS 执行、无 eval、URL 白名单、大小/深度/数量上限、会话隔离；交互只由用户触发。
- **模型中立**：不注入 system prompt、persona 或 skill，不规定模型何时/如何使用富内容。
- **工具**：`rich_msg_validate`（Schema 校验）、`rich_msg_publish`（校验并存入会话 Artifact，返回引用 id）。

## 许可证

MIT。

本项目基于 [kyoukisu/dsh-rich-ui](https://github.com/kyoukisu/dsh-rich-ui)（MIT，Copyright (c) 2026 kyoukisu）的源码进行独立开发与重构，上游版权声明保留在 [LICENSE](LICENSE)；与上游作者无隶属、合作或背书关系。

图标来自 [lucide](https://lucide.dev)（ISC）。

技术文档见 `docs/`。
