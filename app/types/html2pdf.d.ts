declare module 'html2pdf.js' {
  interface Html2PdfOptions {
    margin?: number | number[]
    filename?: string
    enableLinks?: boolean
    image?: { type?: string; quality?: number }
    html2canvas?: {
      scale?: number
      useCORS?: boolean
      letterRendering?: boolean
      logging?: boolean
      [key: string]: unknown
    }
    jsPDF?: {
      unit?: string
      format?: string
      orientation?: 'portrait' | 'landscape'
      [key: string]: unknown
    }
    pagebreak?: {
      mode?: string | string[]
      before?: string | string[]
      after?: string | string[]
      avoid?: string | string[]
    }
  }

  interface Html2PdfInstance {
    set(options: Html2PdfOptions): Html2PdfInstance
    from(element: HTMLElement): Html2PdfInstance
    save(): Promise<void>
    toContainer(): Html2PdfInstance
    toPdf(): Html2PdfInstance
    toCanvas(): Html2PdfInstance
    get<T = unknown>(key: string): Promise<T>
    output(type: string): Promise<unknown>
  }

  function html2pdf(): Html2PdfInstance
  export default html2pdf
}
