import { useState, useRef, useCallback } from 'react'
import { marked } from 'marked'
import markedKatex from 'marked-katex-extension'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'
import 'katex/dist/katex.min.css'
import {
  FileText,
  Download,
  Settings,
  Eye,
  Edit3,
  Sun,
  Moon,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

import type { Route } from './+types/home'
import { downloadPdfDiagnostics, exportHtmlElementToPdf } from '../lib/pdf-export-core'

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'Markdown to PDF' },
    { name: 'description', content: '将 Markdown 导出为 PDF，支持调节行距和各种参数' },
  ]
}

interface PdfSettings {
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

const DEFAULT_MARKDOWN = `# Markdown to PDF 工具

欢迎使用 **Markdown to PDF** 导出工具！

## 功能特性

- 实时预览 Markdown 渲染效果
- 支持代码高亮
- 可调节行距、字体大小、页边距等参数
- 一键导出为 PDF

## 代码示例

\`\`\`javascript
function greet(name) {
  console.log(\`Hello, \${name}!\`)
}

greet('World')
\`\`\`

## 表格示例

| 参数 | 说明 | 默认值 |
|------|------|--------|
| fontSize | 字体大小 | 14px |
| lineHeight | 行距 | 1.6 |
| margin | 页边距 | 20mm |

## 引用

> 这是一段引用文字，可以用来展示引用块的样式效果。

## 数学公式

行内公式：$E = mc^2$，勾股定理 $a^2 + b^2 = c^2$。

块级公式：

$$
\\int_{0}^{1} x^{2}\\,\\mathrm{d}x = \\frac{1}{3}
$$

$$
\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}, \\quad
\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}
$$

---

*开始编辑左侧的 Markdown 内容，右侧将实时预览效果。*
`

const FONT_OPTIONS = [
  { label: '系统默认', value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  { label: '衬线体', value: "Georgia, 'Times New Roman', serif" },
  { label: '等宽体', value: "'SF Mono', Monaco, 'Courier New', monospace" },
]

const PAGE_SIZES = [
  { label: 'A4', value: 'a4' },
  { label: 'A3', value: 'a3' },
  { label: 'Letter', value: 'letter' },
  { label: 'Legal', value: 'legal' },
]

// 在模块作用域配置 marked：代码高亮 + LaTeX 公式（KATEX）
// 放在模块级而不是 useEffect 里，保证首次渲染就能正确输出公式与高亮
marked.use(
  {
    gfm: true,
    breaks: true,
    renderer: {
      code({ text, lang }: { text: string; lang?: string }) {
        const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
        let highlighted: string
        try {
          highlighted = hljs.highlight(text, { language }).value
        } catch {
          highlighted = text
        }
        return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`
      },
    },
  },
  markedKatex({
    throwOnError: false,
    output: 'html',
    nonStandard: true,
    strict: 'ignore',
    trust: false,
  })
)

// marked-katex-extension 只认 $$...$$（行间）和 $...$（行内），
// 这里把 LaTeX 原生的 \[...\] / \(...\) 统一转换过去，转换时跳过代码块与行内代码
function normalizeMathDelimiters(markdown: string): string {
  if (!markdown.includes('\\[') && !markdown.includes('\\(')) return markdown

  const codeSegments: string[] = []
  const protectedText = markdown.replace(
    /```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`/g,
    (segment) => {
      codeSegments.push(segment)
      return `\u0000CODE${codeSegments.length - 1}\u0000`
    }
  )

  const converted = protectedText
    // \[ ... \] => $$ ... $$（独占段落，保证渲染成行间公式）
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, body: string) => `\n\n$$\n${body.trim()}\n$$\n\n`)
    // \( ... \) => $ ... $
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, body: string) => `$${body.trim()}$`)

  return converted.replace(/\u0000CODE(\d+)\u0000/g, (_match, index: string) => codeSegments[Number(index)])
}

interface NumberSliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  onChange: (value: number) => void
}

function NumberSlider({ label, value, min, max, step, unit, onChange }: NumberSliderProps) {
  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    if (raw === '' || raw === '-') return
    const parsed = Number(raw)
    if (Number.isNaN(parsed)) return
    const clamped = Math.min(max, Math.max(min, parsed))
    onChange(clamped)
  }

  return (
    <div className="settings-group">
      <label className="settings-label">{label}</label>
      <div className="settings-row">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleNumberChange}
          className="settings-number"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="settings-input"
        />
        {unit && <span className="settings-label">{unit}</span>}
      </div>
    </div>
  )
}

export default function Home() {  const [markdown, setMarkdown] = useState(DEFAULT_MARKDOWN)
  const [settingsOpen, setSettingsOpen] = useState(true)
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit')
  const [exporting, setExporting] = useState(false)
  const [diagnosticsText, setDiagnosticsText] = useState<string | null>(null)
  const [settings, setSettings] = useState<PdfSettings>({
    fontSize: 14,
    lineHeight: 1.1,
    headingSpacing: 0.5,
    marginVertical: 12,
    marginHorizontal: 12,
    fontFamily: FONT_OPTIONS[0].value,
    pageSize: 'a4',
    theme: 'light',
    compactMode: false,
    noHorizontalLine: false,
  })

  const previewRef = useRef<HTMLDivElement>(null)
  const previewContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isSyncingRef = useRef(false)

  const renderMarkdown = useCallback(() => {
    try {
      let content = normalizeMathDelimiters(markdown)
      // 无空行模式：移除多余的空行
      if (settings.compactMode) {
        content = content
          .replace(/\n{3,}/g, '\n\n') // 多个空行变为一个空行
          .replace(/^\s*\n/gm, '\n') // 移除行首空白后的换行
          .trim()
      }
      // 无横切线模式：移除 Markdown 中的横线
      if (settings.noHorizontalLine) {
        content = content.replace(/^\s*---+\s*$/gm, '') // 移除 --- 横线
        content = content.replace(/^\s*\*\*\*+\s*$/gm, '') // 移除 *** 横线
        content = content.replace(/^\s*___+\s*$/gm, '') // 移除 ___ 横线
      }
      return marked(content) as string
    } catch {
      return '<p>Markdown 解析错误</p>'
    }
  }, [markdown, settings.compactMode, settings.noHorizontalLine])

  const renderedHtml = renderMarkdown()

  // 双向滚动同步：MD 编辑区与 PDF 预览区按滚动比例联动
  const handleEditorScroll = useCallback(() => {
    if (isSyncingRef.current) return
    const textarea = textareaRef.current
    const container = previewContainerRef.current
    if (!textarea || !container) return
    const textareaMax = textarea.scrollHeight - textarea.clientHeight
    if (textareaMax <= 0) return
    const ratio = textarea.scrollTop / textareaMax
    const containerMax = container.scrollHeight - container.clientHeight
    isSyncingRef.current = true
    container.scrollTop = ratio * containerMax
    requestAnimationFrame(() => {
      isSyncingRef.current = false
    })
  }, [])

  const handlePreviewScroll = useCallback(() => {
    if (isSyncingRef.current) return
    const textarea = textareaRef.current
    const container = previewContainerRef.current
    if (!textarea || !container) return
    const containerMax = container.scrollHeight - container.clientHeight
    if (containerMax <= 0) return
    const ratio = container.scrollTop / containerMax
    const textareaMax = textarea.scrollHeight - textarea.clientHeight
    isSyncingRef.current = true
    textarea.scrollTop = ratio * textareaMax
    requestAnimationFrame(() => {
      isSyncingRef.current = false
    })
  }, [])

  const updateSetting = <K extends keyof PdfSettings>(key: K, value: PdfSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  const handleExportPdf = async () => {
    if (!previewRef.current) return
    setExporting(true)
    try {
      const result = await exportHtmlElementToPdf({
        element: previewRef.current,
        settings,
        markdown,
        renderedHtmlLength: renderedHtml.length,
        scale: 2,
        filename: 'markdown-export.pdf',
      })
      setDiagnosticsText(result.diagnosticsText)
    } catch (error) {
      console.error('[PDF] 导出诊断模块调用失败:', error)
    } finally {
      setExporting(false)
    }
  }

  const previewStyle: React.CSSProperties = {
    fontSize: `${settings.fontSize}px`,
    lineHeight: settings.lineHeight,
    fontFamily: settings.fontFamily,
    padding: `${settings.marginVertical}px ${settings.marginHorizontal}px ${settings.marginVertical}px ${settings.marginHorizontal}px`,
    '--heading-spacing': `${settings.headingSpacing}em`,
  } as React.CSSProperties

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <FileText className="icon-lg" color="#3b82f6" />
          <h1 className="header-title">Markdown to PDF</h1>
        </div>
        <div className="header-right">
          <button className="btn btn-secondary" onClick={() => setSettingsOpen(!settingsOpen)}>
            <Settings className="icon" />
            <span>设置</span>
            {settingsOpen ? <ChevronUp className="icon-sm" /> : <ChevronDown className="icon-sm" />}
          </button>
          {diagnosticsText && (
            <button
              className="btn btn-secondary"
              onClick={() => downloadPdfDiagnostics(diagnosticsText)}
              disabled={exporting}
            >
              <Download className="icon" />
              <span>下载诊断 TXT</span>
            </button>
          )}
          <button className="btn btn-primary" onClick={handleExportPdf} disabled={exporting}>
            <Download className="icon" />
            <span>{exporting ? '导出中...' : '导出 PDF'}</span>
          </button>
        </div>
      </header>

      {/* Settings Panel */}
      {settingsOpen && (
        <div className="settings-panel">
          {/* Font Size */}
          <NumberSlider
            label="字体大小"
            value={settings.fontSize}
            min={10}
            max={24}
            step={1}
            unit="px"
            onChange={(v) => updateSetting('fontSize', v)}
          />

          {/* Line Height */}
          <NumberSlider
            label="行距"
            value={settings.lineHeight}
            min={1}
            max={3}
            step={0.1}
            onChange={(v) => updateSetting('lineHeight', v)}
          />

          {/* Heading Spacing */}
          <NumberSlider
            label="标题间距"
            value={settings.headingSpacing}
            min={0.2}
            max={3}
            step={0.1}
            unit="em"
            onChange={(v) => updateSetting('headingSpacing', v)}
          />

          {/* Font Family */}
          <div className="settings-group">
            <label className="settings-label">字体</label>
            <select
              value={settings.fontFamily}
              onChange={(e) => updateSetting('fontFamily', e.target.value)}
              className="settings-select"
            >
              {FONT_OPTIONS.map((opt) => (
                <option key={opt.label} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Page Size */}
          <div className="settings-group">
            <label className="settings-label">纸张大小</label>
            <select
              value={settings.pageSize}
              onChange={(e) => updateSetting('pageSize', e.target.value)}
              className="settings-select"
            >
              {PAGE_SIZES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Margins */}
          <NumberSlider
            label="上下边距"
            value={settings.marginVertical}
            min={0}
            max={50}
            step={1}
            unit="mm"
            onChange={(v) => updateSetting('marginVertical', v)}
          />

          <NumberSlider
            label="左右边距"
            value={settings.marginHorizontal}
            min={0}
            max={50}
            step={1}
            unit="mm"
            onChange={(v) => updateSetting('marginHorizontal', v)}
          />

          {/* Compact Mode */}
          <div className="settings-group">
            <label className="settings-label">无空行模式</label>
            <button
              className={`btn ${settings.compactMode ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => updateSetting('compactMode', !settings.compactMode)}
            >
              {settings.compactMode ? '已开启' : '已关闭'}
            </button>
          </div>

          {/* No Horizontal Line Mode */}
          <div className="settings-group">
            <label className="settings-label">无横切线模式</label>
            <button
              className={`btn ${settings.noHorizontalLine ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => updateSetting('noHorizontalLine', !settings.noHorizontalLine)}
            >
              {settings.noHorizontalLine ? '已开启' : '已关闭'}
            </button>
          </div>

          {/* Theme */}
          <div className="settings-group">
            <label className="settings-label">主题</label>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button
                className={`btn btn-icon ${settings.theme === 'light' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => updateSetting('theme', 'light')}
              >
                <Sun className="icon" />
              </button>
              <button
                className={`btn btn-icon ${settings.theme === 'dark' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => updateSetting('theme', 'dark')}
              >
                <Moon className="icon" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Tab Switcher */}
      <div className="tab-switcher">
        <button
          className={`tab-btn ${activeTab === 'edit' ? 'active' : ''}`}
          onClick={() => setActiveTab('edit')}
        >
          <Edit3 className="icon" />
          <span>编辑</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'preview' ? 'active' : ''}`}
          onClick={() => setActiveTab('preview')}
        >
          <Eye className="icon" />
          <span>预览</span>
        </button>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Editor Panel */}
        <div
          className={`editor-panel ${activeTab !== 'edit' ? 'hidden' : ''}`}
          style={{ display: activeTab === 'edit' ? 'flex' : undefined }}
        >
          <div className="panel-header">
            <Edit3 className="icon-sm" color="#6b7280" />
            <span className="panel-title">Markdown 编辑</span>
          </div>
          <textarea
            ref={textareaRef}
            className="editor-textarea"
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            onScroll={handleEditorScroll}
            placeholder="在此输入 Markdown 内容..."
            spellCheck={false}
          />
        </div>

        {/* Preview Panel */}
        <div
          className={`preview-panel ${activeTab !== 'preview' ? 'hidden' : ''}`}
          style={{ display: activeTab === 'preview' ? 'flex' : undefined }}
        >
          <div className="panel-header">
            <Eye className="icon-sm" color="#6b7280" />
            <span className="panel-title">预览</span>
          </div>
          <div
            ref={previewContainerRef}
            className={`preview-container ${settings.theme === 'dark' ? 'dark' : ''}`}
            onScroll={handlePreviewScroll}
          >
            <div
              ref={previewRef}
              className="markdown-preview"
              style={previewStyle}
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
