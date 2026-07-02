import { useState, useRef, useCallback, useEffect } from 'react'
import { marked } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'
import html2pdf from 'html2pdf.js'
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
    marked.use({
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
          <div className="settings-group">
            <label className="settings-label">字体大小: {settings.fontSize}px</label>
            <input
              type="range"
              min="10"
              max="24"
              step="1"
              value={settings.fontSize}
              onChange={(e) => updateSetting('fontSize', Number(e.target.value))}
              className="settings-input settings-input-wide"
            />
          </div>

          {/* Line Height */}
          <div className="settings-group">
            <label className="settings-label">行距: {settings.lineHeight}</label>
            <input
              type="range"
              min="1"
              max="3"
              step="0.1"
              value={settings.lineHeight}
              onChange={(e) => updateSetting('lineHeight', Number(e.target.value))}
              className="settings-input settings-input-wide"
            />
          </div>

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
          <div className="settings-group">
            <label className="settings-label">上边距: {settings.marginTop}mm</label>
            <input
              type="range"
              min="0"
              max="50"
              step="1"
              value={settings.marginTop}
              onChange={(e) => updateSetting('marginTop', Number(e.target.value))}
              className="settings-input"
            />
          </div>
          <div className="settings-group">
            <label className="settings-label">下边距: {settings.marginBottom}mm</label>
            <input
              type="range"
              min="0"
              max="50"
              step="1"
              value={settings.marginBottom}
              onChange={(e) => updateSetting('marginBottom', Number(e.target.value))}
              className="settings-input"
            />
          </div>
          <div className="settings-group">
            <label className="settings-label">左边距: {settings.marginLeft}mm</label>
            <input
              type="range"
              min="0"
              max="50"
              step="1"
              value={settings.marginLeft}
              onChange={(e) => updateSetting('marginLeft', Number(e.target.value))}
              className="settings-input"
            />
          </div>
          <div className="settings-group">
            <label className="settings-label">右边距: {settings.marginRight}mm</label>
            <input
              type="range"
              min="0"
              max="50"
              step="1"
              value={settings.marginRight}
              onChange={(e) => updateSetting('marginRight', Number(e.target.value))}
              className="settings-input"
            />
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
            className="editor-textarea"
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
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
          <div className={`preview-container ${settings.theme === 'dark' ? 'dark' : ''}`}>
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
