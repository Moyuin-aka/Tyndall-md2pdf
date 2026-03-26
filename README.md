# md2pdf

将 Markdown 转换为 Tyndall 博客样式的 PDF。

## 安装依赖

```bash
pnpm add -D puppeteer gray-matter highlight.js
```

## 使用

```bash
# 基本用法
node md2pdf.mjs input.md

# 指定输出路径
node md2pdf.mjs input.md output.pdf

# 或通过 pnpm script
pnpm pdf input.md
```

## 可选参数

| 参数 | 说明 |
|------|------|
| `--dark` | 暗色主题 |
| `--lang=en` | 文档语言（默认 `zh`） |

## 支持的特性

- Frontmatter 标题
- 代码块语法高亮（Apple 风格）
- Mermaid 图表
- KaTeX 数学公式
- 表格、列表、引用、脚注等完整 Markdown 语法
- 页脚（标题 + 页码）
- 亮色 / 暗色主题
