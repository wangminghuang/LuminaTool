import html2canvas from 'html2canvas'
import html2pdf from 'html2pdf.js'
import { jsPDF } from 'jspdf'

export interface PdfExportSettings {
  fontSize: number
  lineHeight: number
  headingSpacing: number
  marginVertical: number
  marginHorizontal: number
  fontFamily: string
  pageSize: string
  theme: 'light' | 'dark'
  compactMode: boolean
  noHorizontalLine: boolean
}

export interface PdfExportInput {
  element: HTMLElement
  settings: PdfExportSettings
  markdown?: string
  renderedHtmlLength?: number
  scale?: number
  filename?: string
}

export interface PdfExportResult {
  diagnosticsText: string
  success: boolean
}

type LogLevel = 'log' | 'warn' | 'error'
type Html2PdfOptions = {
  margin: number[]
  filename: string
  enableLinks: boolean
  image: { type: string; quality: number }
  html2canvas: { scale: number; useCORS: boolean; logging: boolean }
  jsPDF: { unit: 'cm'; format: string; orientation: 'portrait' }
  pagebreak: { mode: string[]; avoid: string[] }
}
type Html2PdfWorker = {
  set(options: Html2PdfOptions): Html2PdfWorker
  from(element: HTMLElement): Html2PdfWorker
  toContainer(): Html2PdfWorker
  get<T = unknown>(key: string): Promise<T>
}
type DiagnosticLogger = {
  log: (...values: unknown[]) => void
  warn: (...values: unknown[]) => void
  error: (...values: unknown[]) => void
  table: (rows: unknown[]) => void
}

const PAGE_DIMENSIONS_CM: Record<string, { width: number; height: number }> = {
  a4: { width: 21, height: 29.7 },
  a3: { width: 29.7, height: 42 },
  letter: { width: 21.59, height: 27.94 },
  legal: { width: 21.59, height: 35.56 },
}

const CANVAS_SAFE_SIDE = 32767
const CANVAS_HARD_SIDE = 65535
const CANVAS_AREA_LIMIT = 268_435_456

function round(n: number, digits = 2) {
  return Number.isFinite(n) ? Number(n.toFixed(digits)) : n
}

function formatDiagnosticValue(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ''}`
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}

function createDiagnosticLogger(lines: string[]): DiagnosticLogger {
  const write = (level: LogLevel, ...values: unknown[]) => {
    console[level](...values)
    lines.push(
      `${new Date().toISOString()} [${level.toUpperCase()}] ${values.map(formatDiagnosticValue).join(' ')}`
    )
  }

  return {
    log: (...values) => write('log', ...values),
    warn: (...values) => write('warn', ...values),
    error: (...values) => write('error', ...values),
    table: (rows) => {
      console.table(rows)
      lines.push(`[TABLE]\n${formatDiagnosticValue(rows)}`)
    },
  }
}

export function downloadPdfDiagnostics(content: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `pdf-export-diagnostics-${timestamp}.txt`
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function fitOverflowingMath(root: HTMLElement): () => void {
  const restored: { element: HTMLElement; fontSize: string }[] = []

  root.querySelectorAll<HTMLElement>('.katex-display').forEach((display) => {
    const available = display.clientWidth
    const contentWidth = display.scrollWidth
    if (!available || contentWidth <= available + 1) return

    const katex = display.querySelector<HTMLElement>('.katex')
    if (!katex) return

    const factor = Math.max(0.45, available / contentWidth)
    if (factor >= 0.999) return

    const current = parseFloat(window.getComputedStyle(katex).fontSize) || 16
    restored.push({ element: katex, fontSize: katex.style.fontSize })
    katex.style.fontSize = `${current * factor}px`
  })

  return () => {
    restored.forEach(({ element, fontSize }) => {
      element.style.fontSize = fontSize
    })
  }
}

function logElementReport(
  label: string,
  root: HTMLElement,
  pageHeightPx: number,
  logger: DiagnosticLogger
) {
  const rect = root.getBoundingClientRect()
  const style = window.getComputedStyle(root)
  const images = Array.from(root.querySelectorAll<HTMLImageElement>('img'))
  const breakableElements = Array.from(
    root.querySelectorAll<HTMLElement>('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, table, tr, img, .katex-display')
  )
  const avoidBreakCount = breakableElements.filter((node) => {
    const nodeStyle = window.getComputedStyle(node)
    return nodeStyle.breakInside === 'avoid' || nodeStyle.pageBreakInside === 'avoid'
  }).length
  const tallElements = breakableElements
    .map((node, index) => {
      const nodeRect = node.getBoundingClientRect()
      return {
        index,
        tag: node.tagName.toLowerCase(),
        className: typeof node.className === 'string' ? node.className.slice(0, 100) : '',
        y: round(nodeRect.top - rect.top, 0),
        height: round(nodeRect.height, 0),
        scrollHeight: node.scrollHeight,
        textLength: node.textContent?.length ?? 0,
        breakInside: window.getComputedStyle(node).breakInside,
      }
    })
    .filter((node) => node.height > pageHeightPx || node.scrollHeight > pageHeightPx)
    .sort((a, b) => b.height - a.height)
    .slice(0, 12)

  logger.log(`[PDF] ${label}`, {
    tag: root.tagName.toLowerCase(),
    className: root.className,
    rect: { x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height) },
    client: { width: root.clientWidth, height: root.clientHeight },
    scroll: { width: root.scrollWidth, height: root.scrollHeight },
    display: style.display,
    position: style.position,
    overflow: `${style.overflowX}/${style.overflowY}`,
    padding: style.padding,
    childCount: root.children.length,
    contentCounts: {
      paragraphs: root.querySelectorAll('p').length,
      listItems: root.querySelectorAll('li').length,
      tables: root.querySelectorAll('table').length,
      codeBlocks: root.querySelectorAll('pre').length,
      mathBlocks: root.querySelectorAll('.katex-display').length,
      images: images.length,
      imagesNotReady: images.filter((image) => !image.complete).length,
      imagesFailed: images.filter((image) => image.complete && image.naturalWidth === 0).length,
      pageBreakMarkers: root.querySelectorAll('.html2pdf__page-break').length,
      breakAvoidElements: avoidBreakCount,
    },
    tallElementCount: breakableElements.filter((node) => node.scrollHeight > pageHeightPx).length,
  })

  if (tallElements.length) logger.table(tallElements)
}

function logCanvasReport(
  canvas: HTMLCanvasElement,
  innerRatio: number,
  scale: number,
  logger: DiagnosticLogger
) {
  const pxPageHeight = Math.floor(canvas.width * innerRatio)
  const nPages = pxPageHeight > 0 ? Math.ceil(canvas.height / pxPageHeight) : 0

  logger.log('[PDF] 单页 canvas 尺寸', {
    width: canvas.width,
    height: canvas.height,
    对应CSS高度: `${round(canvas.height / scale, 0)}px`,
    单页像素高: pxPageHeight,
    页数: nPages,
    是否超单边警戒线: canvas.height > CANVAS_SAFE_SIDE,
    是否超单边硬上限: canvas.height > CANVAS_HARD_SIDE,
    是否超面积上限: canvas.width * canvas.height > CANVAS_AREA_LIMIT,
  })

  if (canvas.height > CANVAS_HARD_SIDE) {
    logger.error(`[PDF] 单页 canvas 高度超过 ${CANVAS_HARD_SIDE}px 的硬上限`)
  } else if (canvas.height > CANVAS_SAFE_SIDE) {
    logger.warn(`[PDF] 单页 canvas 高度超过 ${CANVAS_SAFE_SIDE}px 的警戒线`)
  }

  try {
    const context = canvas.getContext('2d')
    if (!context) {
      logger.warn('[PDF] 取不到 2d context')
      return
    }

    const bandHeight = Math.min(160, canvas.height)
    const bandWidth = Math.min(400, canvas.width)
    const bands = [0, 0.1, 0.3, 0.5, 0.7, 0.9, 0.99].map((ratio) => {
      const y = Math.max(0, Math.min(Math.floor(canvas.height * ratio), canvas.height - bandHeight))
      const data = context.getImageData(0, y, bandWidth, bandHeight).data
      let visibleInk = 0
      let transparent = 0

      for (let index = 0; index < data.length; index += 4) {
        const alpha = data[index + 3] / 255
        if (alpha < 0.05) {
          transparent++
          continue
        }
        const red = data[index] * alpha + 255 * (1 - alpha)
        const green = data[index + 1] * alpha + 255 * (1 - alpha)
        const blue = data[index + 2] * alpha + 255 * (1 - alpha)
        if (red < 245 || green < 245 || blue < 245) visibleInk++
      }

      return {
        position: `${Math.round(ratio * 100)}%`,
        y,
        visibleNonWhiteRatio: round(visibleInk / (bandWidth * bandHeight), 4),
        transparentRatio: round(transparent / (bandWidth * bandHeight), 4),
      }
    })

    logger.table(bands)
    if (bands.every((band) => band.visibleNonWhiteRatio === 0)) {
      logger.error('[PDF] 当前页的抽样区域没有可见非白像素')
    }
  } catch (error) {
    logger.error('[PDF] canvas 像素抽样失败', error)
  }
}

/**
 * Export a rendered HTML element to a paginated PDF without creating a full-document canvas.
 * The function also downloads a diagnostic .txt file and returns its content for UI fallback.
 */
export async function exportHtmlElementToPdf(input: PdfExportInput): Promise<PdfExportResult> {
  const { element, settings, markdown = '', renderedHtmlLength = 0, filename = 'markdown-export.pdf' } = input
  const scale = input.scale ?? 2
  const startedAt = performance.now()
  const diagnosticLines = [
    `PDF export diagnostics started: ${new Date().toISOString()}`,
    `User agent: ${navigator.userAgent}`,
    `Viewport: ${window.innerWidth} x ${window.innerHeight}; devicePixelRatio=${window.devicePixelRatio}`,
  ]
  const logger = createDiagnosticLogger(diagnosticLines)
  let restoreMath = () => {}
  let exportContainer: HTMLElement | null = null
  let success = false
  let diagnosticsText = ''

  console.group('[PDF] 导出诊断')

  try {
    const page = PAGE_DIMENSIONS_CM[settings.pageSize] ?? PAGE_DIMENSIONS_CM.a4
    const innerWidth = page.width - (settings.marginHorizontal / 10) * 2
    const innerHeight = page.height - (settings.marginVertical / 10) * 2
    const innerRatio = innerWidth > 0 ? innerHeight / innerWidth : 0
    const cloneWidthPx = (innerWidth * 96) / 2.54
    // Keep this consistent with html2pdf's pagebreak plugin, which floors printable height in CSS px.
    const pageHeightPx = Math.floor((innerHeight * 96) / 2.54)
    const reflowRatio = cloneWidthPx / Math.max(element.offsetWidth, 1)
    const estimatedCloneHeight = Math.round(element.scrollHeight * reflowRatio)

    logger.log('当前设置', settings)
    const markdownLines = markdown.split(/\r\n|\r|\n/)
    logger.log('[PDF] 输入内容摘要', {
      来源: '传入的 Markdown 文本（不记录正文）',
      字符数: markdown.length,
      UTF8字节数: new TextEncoder().encode(markdown).length,
      行数: markdownLines.length,
      非空行数: markdownLines.filter((line) => line.trim().length > 0).length,
      最长行字符数: markdownLines.reduce((max, line) => Math.max(max, line.length), 0),
      CRLF行数: (markdown.match(/\r\n/g) ?? []).length,
      裸CR数量: (markdown.match(/\r(?!\n)/g) ?? []).length,
      NUL字符数: (markdown.match(/\u0000/g) ?? []).length,
      替换字符数: (markdown.match(/\uFFFD/g) ?? []).length,
      渲染HTML字符数: renderedHtmlLength,
    })
    logger.log('页面几何', {
      纸张: settings.pageSize,
      纸张cm: `${page.width} x ${page.height}`,
      可打印区域cm: `${round(innerWidth)} x ${round(innerHeight)}`,
      可打印区域px: `${round(cloneWidthPx, 0)} x ${pageHeightPx}`,
      innerRatio: round(innerRatio, 4),
      单页像素高: Math.floor(cloneWidthPx * scale * innerRatio),
    })
    logger.log('元素尺寸与预估', {
      预览元素宽: element.offsetWidth,
      预览元素高: element.scrollHeight,
      克隆后宽度: `${round(cloneWidthPx, 0)}px（克隆后会重排）`,
      估算克隆高度: `${estimatedCloneHeight}px`,
      整篇单canvas估算高度: `${estimatedCloneHeight * scale}px（scale=${scale}；不会创建整篇canvas）`,
      估算页数: Math.max(1, Math.ceil(estimatedCloneHeight / Math.max(pageHeightPx, 1))),
      预估说明: '按宽度比例推算，仅供参考；以克隆后的实际尺寸为准',
      元素数量: {
        paragraphs: element.querySelectorAll('p').length,
        listItems: element.querySelectorAll('li').length,
        tables: element.querySelectorAll('table').length,
        codeBlocks: element.querySelectorAll('pre').length,
        mathBlocks: element.querySelectorAll('.katex-display').length,
      },
    })

    try {
      await document.fonts?.ready
    } catch {
      logger.warn('[PDF] 等待字体加载失败，继续导出')
    }
    restoreMath = fitOverflowingMath(element)

    const pdfOptions = {
      margin: [
        settings.marginVertical / 10,
        settings.marginHorizontal / 10,
        settings.marginVertical / 10,
        settings.marginHorizontal / 10,
      ],
      filename,
      enableLinks: false,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale, useCORS: true, logging: false },
      jsPDF: { unit: 'cm', format: settings.pageSize, orientation: 'portrait' as const },
      pagebreak: {
        mode: ['css', 'legacy'],
        avoid: ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre', 'table', 'tr', 'img', '.katex-display'],
      },
    }

    // Keep html2pdf's DOM clone and pagebreak adjustments, but never call its whole-document toCanvas().
    const containerWorker = (html2pdf() as unknown as Html2PdfWorker).set(pdfOptions).from(element)
    const cloneStart = performance.now()
    await containerWorker.toContainer()
    exportContainer = (await containerWorker.get('container')) as HTMLElement | null
    logger.log(`[PDF] DOM 克隆耗时 ${Math.round(performance.now() - cloneStart)}ms`)
    if (!exportContainer) throw new Error('html2pdf 没有返回导出容器')

    const clonedElement = exportContainer.querySelector<HTMLElement>('.markdown-preview')
    logElementReport('导出容器尺寸', exportContainer, pageHeightPx, logger)
    if (clonedElement) logElementReport('克隆预览尺寸', clonedElement, pageHeightPx, logger)
    else logger.warn('[PDF] 克隆容器中找不到 .markdown-preview')

    const exportWidth = exportContainer.scrollWidth
    const exportHeight = exportContainer.scrollHeight
    const containerRect = exportContainer.getBoundingClientRect()
    const pageLinks = Array.from(exportContainer.querySelectorAll<HTMLAnchorElement>('a[href]')).flatMap((anchor) =>
      Array.from(anchor.getClientRects()).map((rect) => ({
        href: anchor.href,
        x: rect.left - containerRect.left,
        y: rect.top - containerRect.top,
        width: rect.width,
        height: rect.height,
      }))
    )
    const pageCanvasHeight = Math.floor(Math.floor(exportWidth * scale) * innerRatio)
    const pageRenderHeightCss = pageCanvasHeight / scale
    const pageCount = Math.max(1, Math.ceil(exportHeight / Math.max(pageHeightPx, 1)))

    logger.log('[PDF] 分页光栅化计划', {
      内容尺寸CSS: `${exportWidth} x ${exportHeight}px`,
      单页canvas尺寸: `${Math.floor(exportWidth * scale)} x ${pageCanvasHeight}px`,
      分页边界高度CSS: pageHeightPx,
      光栅化裁切高度CSS: round(pageRenderHeightCss, 2),
      页数: pageCount,
      链接区域: pageLinks.length,
      整篇canvas: '不创建',
    })

    const pdf = new jsPDF({ unit: 'cm', format: settings.pageSize, orientation: 'portrait' })
    const rasterStart = performance.now()

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
      const pageY = pageIndex * pageHeightPx
      const cropHeight = Math.min(pageRenderHeightCss, exportHeight - pageY)
      const pageStart = performance.now()
      const pageCanvas = await html2canvas(exportContainer, {
        scale,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        x: 0,
        y: pageY,
        width: exportWidth,
        height: cropHeight,
        windowWidth: document.documentElement.clientWidth,
        windowHeight: document.documentElement.clientHeight,
        scrollX: 0,
        scrollY: 0,
      })

      logger.log(`[PDF] 页面光栅化 ${pageIndex + 1}/${pageCount}`, {
        y: round(pageY, 2),
        cropHeight: round(cropHeight, 2),
        canvas: `${pageCanvas.width} x ${pageCanvas.height}px`,
        耗时ms: Math.round(performance.now() - pageStart),
      })
      logCanvasReport(pageCanvas, innerRatio, scale, logger)

      const imageHeightCm =
        pageCanvas.height < pageCanvasHeight
          ? Math.min(innerHeight, (pageCanvas.height / pageCanvas.width) * innerWidth)
          : innerHeight
      if (pageIndex > 0) pdf.addPage()
      pdf.addImage(
        pageCanvas.toDataURL('image/jpeg', 0.98),
        'JPEG',
        settings.marginHorizontal / 10,
        settings.marginVertical / 10,
        innerWidth,
        imageHeightCm
      )

      const pageScaleX = innerWidth / exportWidth
      const pageScaleY = imageHeightCm / cropHeight
      for (const link of pageLinks) {
        const visibleTop = Math.max(link.y, pageY)
        const visibleBottom = Math.min(link.y + link.height, pageY + cropHeight)
        if (visibleBottom <= visibleTop || link.width <= 0) continue
        pdf.setPage(pageIndex + 1)
        pdf.link(
          settings.marginHorizontal / 10 + link.x * pageScaleX,
          settings.marginVertical / 10 + (visibleTop - pageY) * pageScaleY,
          link.width * pageScaleX,
          (visibleBottom - visibleTop) * pageScaleY,
          { url: link.href }
        )
      }

      pageCanvas.width = 0
      pageCanvas.height = 0
    }

    logger.log(`[PDF] 分页光栅化总耗时 ${Math.round(performance.now() - rasterStart)}ms`)
    const pdfStart = performance.now()
    await pdf.save(filename)
    logger.log(`[PDF] 生成PDF耗时 ${Math.round(performance.now() - pdfStart)}ms`)
    logger.log(`[PDF] 导出完成，总耗时 ${Math.round(performance.now() - startedAt)}ms`)
    success = true
  } catch (error) {
    logger.error('[PDF] 导出失败:', error)
  } finally {
    exportContainer?.parentElement?.remove()
    restoreMath()
    logger.log(`[PDF] 诊断结束，总耗时 ${Math.round(performance.now() - startedAt)}ms`)
    diagnosticsText = diagnosticLines.join('\r\n\r\n')
    try {
      downloadPdfDiagnostics(diagnosticsText)
      console.log('[PDF] 诊断日志已下载为 txt 文件')
    } catch (error) {
      console.error('[PDF] 诊断日志文件下载失败:', error)
    }
    console.groupEnd()
  }

  return { diagnosticsText, success }
}
