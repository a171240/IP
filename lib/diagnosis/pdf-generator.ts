'use client'

import { marked } from 'marked'

// 配置 marked 为同步模式
marked.setOptions({
  async: false
})

export interface PDFOptions {
  filename?: string
  margin?: number
  image?: { type: string; quality: number }
  html2canvas?: { scale: number }
  jsPDF?: { unit: string; format: string; orientation: string }
}

// Markdown PDF 样式
const MARKDOWN_PDF_STYLES = `
<style>
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    line-height: 1.8;
    color: #1a1a1a;
    background: #ffffff;
    padding: 40px;
    max-width: 210mm;
  }

  h1 {
    font-size: 28px;
    font-weight: 700;
    color: #111;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 3px solid #10b981;
  }

  h2 {
    font-size: 22px;
    font-weight: 600;
    color: #222;
    margin-top: 32px;
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 2px solid #e5e7eb;
  }

  h3 {
    font-size: 18px;
    font-weight: 600;
    color: #333;
    margin-top: 24px;
    margin-bottom: 12px;
  }

  h4 {
    font-size: 16px;
    font-weight: 600;
    color: #444;
    margin-top: 20px;
    margin-bottom: 8px;
  }

  p {
    margin-bottom: 12px;
    text-align: justify;
  }

  blockquote {
    margin: 16px 0;
    padding: 16px 20px;
    background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
    border-left: 4px solid #10b981;
    border-radius: 0 8px 8px 0;
    font-style: italic;
    color: #166534;
  }

  blockquote p {
    margin: 0;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 16px 0;
    font-size: 14px;
  }

  th, td {
    padding: 12px 16px;
    text-align: left;
    border: 1px solid #e5e7eb;
  }

  th {
    background: #f9fafb;
    font-weight: 600;
    color: #374151;
  }

  tr:nth-child(even) {
    background: #fafafa;
  }

  ul, ol {
    margin: 12px 0;
    padding-left: 24px;
  }

  li {
    margin-bottom: 8px;
  }

  strong {
    font-weight: 600;
    color: #111;
  }

  em {
    font-style: italic;
    color: #666;
  }

  hr {
    margin: 32px 0;
    border: none;
    border-top: 1px solid #e5e7eb;
  }

  code {
    background: #f3f4f6;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
    font-size: 14px;
  }

  /* 特殊样式 */
  .highlight-box {
    background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
    padding: 16px;
    border-radius: 8px;
    margin: 16px 0;
    border-left: 4px solid #3b82f6;
  }

  /* 打印优化 */
  @media print {
    body {
      padding: 0;
    }

    h2 {
      page-break-before: auto;
    }

    h3, h4 {
      page-break-after: avoid;
    }

    table, blockquote {
      page-break-inside: avoid;
    }
  }
</style>
`

/**
 * 将 Markdown 转换为带样式的 HTML
 */
export function markdownToStyledHtml(markdown: string): string {
  // marked 可能返回 string 或 Promise<string>，强制同步模式后应该返回 string
  const htmlContent = marked.parse(markdown, { async: false }) as string
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IP内容健康诊断报告</title>
  ${MARKDOWN_PDF_STYLES}
</head>
<body>
  ${htmlContent}
</body>
</html>
  `.trim()
}

/**
 * 从 Markdown 生成 PDF
 */
export async function generatePDFFromMarkdown(
  markdown: string,
  filename?: string
): Promise<void> {
  console.log('=== generatePDFFromMarkdown ===')
  console.log('Markdown length:', markdown.length)

  const html2pdf = (await import('html2pdf.js')).default
  console.log('html2pdf loaded')

  const styledHtml = markdownToStyledHtml(markdown)
  console.log('HTML generated, length:', styledHtml.length)

  // 创建临时容器
  const container = document.createElement('div')
  container.innerHTML = styledHtml
  container.style.position = 'absolute'
  container.style.left = '-9999px'
  container.style.top = '0'
  container.style.width = '210mm'
  container.style.background = '#ffffff'
  document.body.appendChild(container)
  console.log('Container appended to body')

  // 等待渲染
  await new Promise(resolve => setTimeout(resolve, 100))

  const defaultFilename = `IP内容诊断报告_${new Date().toISOString().split('T')[0]}.pdf`

  const options = {
    filename: filename || defaultFilename,
    margin: [15, 15, 15, 15],
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      letterRendering: true,
      logging: true
    },
    jsPDF: {
      unit: 'mm',
      format: 'a4',
      orientation: 'portrait'
    },
    pagebreak: {
      mode: ['avoid-all', 'css', 'legacy']
    }
  }

  try {
    console.log('Starting html2pdf conversion...')
    await html2pdf().set(options).from(container).save()
    console.log('PDF saved')
  } finally {
    if (container.parentNode) {
      document.body.removeChild(container)
    }
    console.log('Container removed')
  }
}

export async function generatePDF(
  element: HTMLElement | string,
  filename?: string,
  options?: PDFOptions
): Promise<void> {
  // 动态导入 html2pdf.js (仅客户端)
  const html2pdf = (await import('html2pdf.js')).default

  // 支持传入元素ID或元素对象
  const targetElement = typeof element === 'string'
    ? document.getElementById(element)
    : element

  if (!targetElement) {
    throw new Error('PDF content element not found')
  }

  const defaultFilename = `IP内容诊断报告_${new Date().toISOString().split('T')[0]}.pdf`

  const defaultOptions = {
    filename: filename || defaultFilename,
    margin: 10,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  }

  const mergedOptions = { ...defaultOptions, ...options }

  await html2pdf()
    .set(mergedOptions)
    .from(targetElement)
    .save()
}

export function downloadPDF(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
