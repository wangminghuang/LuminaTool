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
  headingSpacing: number
  marginTop: number
  marginBottom: number
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
    lineHeight: 1.1,
    headingSpacing: 0.5,
    marginTop: 8,
    marginBottom: 8,
    marginHorizontal: 8,
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
      let content = markdown
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

    const element = previewRef.current
    const opt = {
      margin: [
        settings.marginTop / 10,
        settings.marginHorizontal / 10,
        settings.marginBottom / 10,
        settings.marginHorizontal / 10,
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
    padding: `${settings.marginTop}px ${settings.marginHorizontal}px ${settings.marginBottom}px ${settings.marginHorizontal}px`,
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

          {/* Heading Spacing */}
          <div className="settings-group">
            <label className="settings-label">标题间距: {settings.headingSpacing}em</label>
            <input
              type="range"
              min="0.2"
              max="3"
              step="0.1"
              value={settings.headingSpacing}
              onChange={(e) => updateSetting('headingSpacing', Number(e.target.value))}
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
            <label className="settings-label">左右边距: {settings.marginHorizontal}mm</label>
            <input
              type="range"
              min="0"
              max="50"
              step="1"
              value={settings.marginHorizontal}
              onChange={(e) => updateSetting('marginHorizontal', Number(e.target.value))}
              className="settings-input"
            />
          </div>

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
