import { useState, useRef, useCallback, useEffect } from 'react'
import { marked } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'
import html2pdf from 'html2pdf.js'
import { Button } from '~/components/ui/button'
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

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'Markdown to PDF' },
    { name: 'description', content: '将 Markdown 导出为 PDF，支持调节行距和各种参数' },
  ]
}

interface PdfSettings {
  fontSize: number
  lineHeight: number
  marginTop: number
  marginBottom: number
  marginLeft: number
  marginRight: number
  fontFamily: string
  pageSize: string
  theme: 'light' | 'dark'
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

---

*开始编辑左侧的 Markdown 内容，右侧将实时预览效果。*
`

const FONT_OPTIONS = [
  { label: '系统默认', value: "'Inter', 'Noto Sans SC', sans-serif" },
  { label: '衬线体', value: "'Noto Serif SC', 'Georgia', serif" },
  { label: '等宽体', value: "'JetBrains Mono', 'Fira Code', monospace" },
]

const PAGE_SIZES = [
  { label: 'A4', value: 'a4' },
  { label: 'A3', value: 'a3' },
  { label: 'Letter', value: 'letter' },
  { label: 'Legal', value: 'legal' },
]

export default function Home() {
  const [markdown, setMarkdown] = useState(DEFAULT_MARKDOWN)
  const [settingsOpen, setSettingsOpen] = useState(true)
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit')
  const [exporting, setExporting] = useState(false)
  const [settings, setSettings] = useState<PdfSettings>({
    fontSize: 14,
    lineHeight: 1.6,
    marginTop: 20,
    marginBottom: 20,
    marginLeft: 20,
    marginRight: 20,
    fontFamily: FONT_OPTIONS[0].value,
    pageSize: 'a4',
    theme: 'light',
  })

  const previewRef = useRef<HTMLDivElement>(null)

  // Configure marked with highlight.js
  useEffect(() => {
    marked.setOptions({
      gfm: true,
      breaks: true,
    })
  }, [])

  const renderMarkdown = useCallback(() => {
    try {
      return marked(markdown) as string
    } catch {
      return '<p>Markdown 解析错误</p>'
    }
  }, [markdown])

  const renderedHtml = renderMarkdown()

  const updateSetting = <K extends keyof PdfSettings>(key: K, value: PdfSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  const handleExportPdf = async () => {
    if (!previewRef.current) return
    setExporting(true)

    const element = previewRef.current
    const opt = {
      margin: [
        settings.marginTop / 10,
        settings.marginRight / 10,
        settings.marginBottom / 10,
        settings.marginLeft / 10,
      ],
      filename: 'markdown-export.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        letterRendering: true,
      },
      jsPDF: {
        unit: 'cm',
        format: settings.pageSize,
        orientation: 'portrait' as const,
      },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    }

    try {
      await html2pdf().set(opt).from(element).save()
    } catch (err) {
      console.error('PDF export failed:', err)
    } finally {
      setExporting(false)
    }
  }

  const previewStyle: React.CSSProperties = {
    fontSize: `${settings.fontSize}px`,
    lineHeight: settings.lineHeight,
    fontFamily: settings.fontFamily,
    padding: `${settings.marginTop}px ${settings.marginRight}px ${settings.marginBottom}px ${settings.marginLeft}px`,
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <FileText className="size-5 text-primary" />
          <h1 className="text-lg font-bold">Markdown to PDF</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSettingsOpen(!settingsOpen)}
          >
            <Settings className="size-4" />
            <span className="ml-1">设置</span>
            {settingsOpen ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleExportPdf}
            disabled={exporting}
          >
            <Download className="size-4" />
            <span className="ml-1">{exporting ? '导出中...' : '导出 PDF'}</span>
          </Button>
        </div>
      </header>

      {/* Settings Panel */}
      {settingsOpen && (
        <div className="shrink-0 border-b border-border bg-muted/30 px-4 py-3">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            {/* Font Size */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                字体大小: {settings.fontSize}px
              </label>
              <input
                type="range"
                min="10"
                max="24"
                step="1"
                value={settings.fontSize}
                onChange={(e) => updateSetting('fontSize', Number(e.target.value))}
                className="h-2 w-32 cursor-pointer accent-primary"
              />
            </div>

            {/* Line Height */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                行距: {settings.lineHeight}
              </label>
              <input
                type="range"
                min="1"
                max="3"
                step="0.1"
                value={settings.lineHeight}
                onChange={(e) => updateSetting('lineHeight', Number(e.target.value))}
                className="h-2 w-32 cursor-pointer accent-primary"
              />
            </div>

            {/* Font Family */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">字体</label>
              <select
                value={settings.fontFamily}
                onChange={(e) => updateSetting('fontFamily', e.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2 text-sm"
              >
                {FONT_OPTIONS.map((opt) => (
                  <option key={opt.label} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Page Size */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">纸张大小</label>
              <select
                value={settings.pageSize}
                onChange={(e) => updateSetting('pageSize', e.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2 text-sm"
              >
                {PAGE_SIZES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Margins */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                上边距: {settings.marginTop}mm
              </label>
              <input
                type="range"
                min="0"
                max="50"
                step="1"
                value={settings.marginTop}
                onChange={(e) => updateSetting('marginTop', Number(e.target.value))}
                className="h-2 w-24 cursor-pointer accent-primary"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                下边距: {settings.marginBottom}mm
              </label>
              <input
                type="range"
                min="0"
                max="50"
                step="1"
                value={settings.marginBottom}
                onChange={(e) => updateSetting('marginBottom', Number(e.target.value))}
                className="h-2 w-24 cursor-pointer accent-primary"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                左边距: {settings.marginLeft}mm
              </label>
              <input
                type="range"
                min="0"
                max="50"
                step="1"
                value={settings.marginLeft}
                onChange={(e) => updateSetting('marginLeft', Number(e.target.value))}
                className="h-2 w-24 cursor-pointer accent-primary"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                右边距: {settings.marginRight}mm
              </label>
              <input
                type="range"
                min="0"
                max="50"
                step="1"
                value={settings.marginRight}
                onChange={(e) => updateSetting('marginRight', Number(e.target.value))}
                className="h-2 w-24 cursor-pointer accent-primary"
              />
            </div>

            {/* Theme */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">主题</label>
              <div className="flex gap-1">
                <Button
                  variant={settings.theme === 'light' ? 'default' : 'outline'}
                  size="icon-sm"
                  onClick={() => updateSetting('theme', 'light')}
                >
                  <Sun className="size-4" />
                </Button>
                <Button
                  variant={settings.theme === 'dark' ? 'default' : 'outline'}
                  size="icon-sm"
                  onClick={() => updateSetting('theme', 'dark')}
                >
                  <Moon className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Tab Switcher */}
      <div className="flex shrink-0 border-b border-border md:hidden">
        <button
          className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors ${
            activeTab === 'edit'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('edit')}
        >
          <Edit3 className="size-4" />
          编辑
        </button>
        <button
          className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors ${
            activeTab === 'preview'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('preview')}
        >
          <Eye className="size-4" />
          预览
        </button>
      </div>

      {/* Main Content */}
      <div className="flex min-h-0 flex-1">
        {/* Editor Panel */}
        <div
          className={`flex flex-col border-r border-border ${
            activeTab === 'edit' ? 'flex' : 'hidden'
          } md:flex md:w-1/2`}
        >
          <div className="flex items-center gap-1.5 border-b border-border px-3 py-1.5">
            <Edit3 className="size-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Markdown 编辑</span>
          </div>
          <textarea
            className="flex-1 resize-none bg-background p-4 font-mono text-sm leading-relaxed outline-none placeholder:text-muted-foreground/50"
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            placeholder="在此输入 Markdown 内容..."
            spellCheck={false}
          />
        </div>

        {/* Preview Panel */}
        <div
          className={`flex flex-col ${
            activeTab === 'preview' ? 'flex' : 'hidden'
          } md:flex md:w-1/2`}
        >
          <div className="flex items-center gap-1.5 border-b border-border px-3 py-1.5">
            <Eye className="size-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">预览</span>
          </div>
          <div
            className={`flex-1 overflow-auto ${
              settings.theme === 'dark' ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'
            }`}
          >
            <div
              ref={previewRef}
              className="markdown-preview mx-auto max-w-none"
              style={previewStyle}
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
