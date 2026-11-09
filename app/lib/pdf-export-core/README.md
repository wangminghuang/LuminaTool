# PDF 导出核心

本目录的 `index.ts` 是当前 Markdown PDF 导出功能的实际实现，由 `app/routes/home.tsx` 调用。可将整个目录复制到其他 TypeScript 前端项目。

## 依赖

在目标项目根目录添加直接依赖：

```bash
pnpm add html2canvas@1.4.1 html2pdf.js@0.14.0 jspdf@4.2.1
```

必须将 `html2canvas` 和 `jspdf` 声明为直接依赖。pnpm 不保证应用代码可以导入 `html2pdf.js` 的传递依赖。

## 调用

宿主项目负责渲染 Markdown，并将已挂载、有最终样式的 HTML 元素传给导出函数：

```ts
import { exportHtmlElementToPdf } from './pdf-export-core'

const result = await exportHtmlElementToPdf({
  element: renderedMarkdownElement,
  settings: {
    fontSize: 14,
    lineHeight: 1.5,
    headingSpacing: 0.5,
    marginVertical: 12,
    marginHorizontal: 12,
    fontFamily: 'sans-serif',
    pageSize: 'a4',
    theme: 'light',
    compactMode: false,
    noHorizontalLine: false,
  },
  markdown: sourceMarkdown, // 可选；诊断文件不包含正文
  renderedHtmlLength: renderedHtml.length,
  scale: 2,
  filename: 'markdown-export.pdf',
})

// 用于浏览器拦截自动下载时提供手动下载按钮。
const diagnosticText = result.diagnosticsText
```

调用必须发生在浏览器。函数等待字体就绪，保持 `html2pdf.js` 的 DOM 克隆和 CSS 避分页，然后逐页渲染并组装 PDF；它不会创建整篇高度的 canvas。诊断 TXT 会自动下载，`downloadPdfDiagnostics` 可用于手动重下。

`settings.pageSize` 当前支持 `a4`、`a3`、`letter` 和 `legal`。增加纸张格式时，还需要在 `PAGE_DIMENSIONS_CM` 中补充厘米尺寸。公式文档需要宿主项目加载 KaTeX 样式；远程图片需要服务端允许 CORS。

更多排查证据、实现细节、注意事项和跨电脑依赖安装说明，见仓库 `docs/pdf-export-diagnosis-and-reuse.md`。
