# THIRD-PARTY

## 上游衍生作品

本项目基于 **kyoukisu/dsh-rich-ui** 的源码进行独立开发：

- 上游仓库：https://github.com/kyoukisu/dsh-rich-ui
- 上游版本基线：0.6.2
- 许可证：MIT
- 版权声明：Copyright (c) 2026 kyoukisu

上游 MIT 许可证全文保留在仓库根目录 [LICENSE](../LICENSE)。本项目的修改同样以 MIT 发布；与上游作者不存在隶属、合作或背书关系。

## 运行时依赖

| 依赖 | 许可证 | 用途 | 分发方式 |
|---|---|---|---|
| [lucide-react](https://lucide.dev) | ISC | 图标集合 | 打包进 `lib/client.js` |
| react / react-dom | MIT | 渲染 | 由 DSH Web 外壳静态模块表提供（external） |

lucide-react ISC 许可证要点：保留版权与许可声明；本项目的构建产物中保留了其 legal comments（esbuild `legalComments:'none'` 会移除注释，因此在此以文档形式声明）。

> 如需在分发物中保留完整许可证文本，请将 lucide 的 LICENSE 一并附在分发包中。

## 测试与开发依赖

`vitest`、`jsdom`、`typescript`、`@types/*`、`react`、`react-dom` 仅用于开发与测试，不进入运行时产物。

## 图标与视觉资产

- 不复制 ChatGPT 或其它产品的商标、字体、专有视觉资产；
- 组件视觉来自上游实现 + DSH 主题令牌；
- 示例 JSON 中的图片 URL 均为占位/示例用途。
