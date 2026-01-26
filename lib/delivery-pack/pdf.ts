import { PDFDocument, rgb } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import fs from "fs/promises"
import path from "path"
import { DeliveryPackInput, DeliveryPackOutput } from "./schema"

type PdfCursor = {
  doc: PDFDocument
  page: ReturnType<PDFDocument["addPage"]>
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>
  y: number
}

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN_X = 48
const MARGIN_Y = 56
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2

const COLOR_TEXT = rgb(0.12, 0.12, 0.14)
const COLOR_MUTED = rgb(0.45, 0.48, 0.52)
const COLOR_ACCENT = rgb(0.08, 0.72, 0.55)
const COLOR_ACCENT_DARK = rgb(0.02, 0.48, 0.36)
const COLOR_BLOCK = rgb(0.94, 0.98, 0.96)
const COLOR_LINE = rgb(0.9, 0.9, 0.92)

function wrapText(text: string, font: PdfCursor["font"], size: number, maxWidth: number): string[] {
  const lines: string[] = []
  let current = ""
  for (const char of text) {
    if (char === "\n") {
      lines.push(current)
      current = ""
      continue
    }
    const testLine = current + char
    const width = font.widthOfTextAtSize(testLine, size)
    if (width > maxWidth && current) {
      lines.push(current)
      current = char
    } else {
      current = testLine
    }
  }
  if (current) lines.push(current)
  return lines
}

function ensureSpace(cursor: PdfCursor, height: number) {
  if (cursor.y - height < MARGIN_Y) {
    cursor.page = cursor.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    cursor.y = PAGE_HEIGHT - MARGIN_Y
  }
}

function drawCenteredText(
  page: PdfCursor["page"],
  font: PdfCursor["font"],
  text: string,
  y: number,
  size: number,
  color = COLOR_TEXT
) {
  const width = font.widthOfTextAtSize(text, size)
  const x = Math.max(MARGIN_X, (PAGE_WIDTH - width) / 2)
  page.drawText(text, { x, y, size, font, color })
}

function drawDivider(cursor: PdfCursor) {
  ensureSpace(cursor, 12)
  cursor.page.drawLine({
    start: { x: MARGIN_X, y: cursor.y },
    end: { x: PAGE_WIDTH - MARGIN_X, y: cursor.y },
    thickness: 1,
    color: COLOR_LINE,
  })
  cursor.y -= 12
}

function drawLines(
  cursor: PdfCursor,
  lines: string[],
  size: number,
  indent = 0,
  color = COLOR_TEXT,
  lineGap = 4
) {
  for (const line of lines) {
    ensureSpace(cursor, size + lineGap)
    cursor.page.drawText(line, {
      x: MARGIN_X + indent,
      y: cursor.y,
      size,
      font: cursor.font,
      color,
    })
    cursor.y -= size + lineGap
  }
}

function drawParagraph(
  cursor: PdfCursor,
  text: string,
  size = 11,
  indent = 0,
  color = COLOR_TEXT,
  spacing = 8
) {
  const lines = wrapText(text, cursor.font, size, CONTENT_WIDTH - indent)
  drawLines(cursor, lines, size, indent, color)
  cursor.y -= spacing
}

function drawHeading(cursor: PdfCursor, text: string, size = 16) {
  cursor.y -= 6
  drawLines(cursor, [text], size, 0, COLOR_TEXT, 6)
  cursor.y -= 2
  cursor.page.drawLine({
    start: { x: MARGIN_X, y: cursor.y },
    end: { x: MARGIN_X + 120, y: cursor.y },
    thickness: 2,
    color: COLOR_ACCENT,
  })
  cursor.y -= 12
}

function drawSubheading(cursor: PdfCursor, text: string, size = 13) {
  cursor.y -= 2
  drawLines(cursor, [text], size, 0, COLOR_ACCENT_DARK, 4)
}

function drawBullets(cursor: PdfCursor, items: string[], size = 11, indent = 14) {
  items.forEach((item) => {
    const bullet = "• "
    const lines = wrapText(item, cursor.font, size, CONTENT_WIDTH - indent)
    if (!lines.length) return
    ensureSpace(cursor, size + 4)
    cursor.page.drawText(bullet, {
      x: MARGIN_X,
      y: cursor.y,
      size,
      font: cursor.font,
      color: COLOR_TEXT,
    })
    cursor.page.drawText(lines[0], {
      x: MARGIN_X + indent,
      y: cursor.y,
      size,
      font: cursor.font,
      color: COLOR_TEXT,
    })
    cursor.y -= size + 4
    for (const line of lines.slice(1)) {
      ensureSpace(cursor, size + 4)
      cursor.page.drawText(line, {
        x: MARGIN_X + indent,
        y: cursor.y,
        size,
        font: cursor.font,
        color: COLOR_TEXT,
      })
      cursor.y -= size + 4
    }
  })
  cursor.y -= 6
}

function drawHighlightBox(
  page: PdfCursor["page"],
  font: PdfCursor["font"],
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
  content: string
) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: COLOR_BLOCK,
    borderColor: COLOR_ACCENT,
    borderWidth: 1,
  })
  page.drawText(title, { x: x + 12, y: y + height - 24, size: 12, font, color: COLOR_ACCENT_DARK })
  const lines = wrapText(content, font, 11, width - 24)
  let textY = y + height - 42
  for (const line of lines.slice(0, 3)) {
    page.drawText(line, { x: x + 12, y: textY, size: 11, font, color: COLOR_TEXT })
    textY -= 16
  }
}

function buildStoryboardLines(script: DeliveryPackOutput["scripts_3"][number]): string[] {
  const shot2 = [script.outline[0], script.outline[1]].filter(Boolean).join(" / ")
  return [
    `镜头1：${script.hook}`,
    `镜头2：${shot2 || script.outline[0]}`,
    `镜头3：${script.outline[2]} / CTA:${script.cta}`,
  ]
}

function addCoverPage(doc: PDFDocument, font: PdfCursor["font"], input: DeliveryPackInput, output: DeliveryPackOutput) {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 120, width: PAGE_WIDTH, height: 120, color: COLOR_BLOCK })
  drawCenteredText(page, font, "7天成交交付包", PAGE_HEIGHT - 80, 28, COLOR_TEXT)
  drawCenteredText(page, font, "代运营成交版 · 可直接执行", PAGE_HEIGHT - 110, 12, COLOR_MUTED)

  const meta = `行业：${input.industry}  ｜  平台：${input.platform}  ｜  账号类型：${input.account_type}`
  drawCenteredText(page, font, meta, PAGE_HEIGHT - 150, 11, COLOR_MUTED)

  drawCenteredText(page, font, `生成日期：${new Date().toLocaleDateString("zh-CN")}`, PAGE_HEIGHT - 170, 10, COLOR_MUTED)

  const boxY = PAGE_HEIGHT - 330
  drawHighlightBox(page, font, MARGIN_X, boxY, CONTENT_WIDTH, 86, "核心瓶颈", output.scorecard.core_bottleneck)

  const actions = output.scorecard.top_actions.slice(0, 3).join(" / ")
  drawHighlightBox(page, font, MARGIN_X, boxY - 110, CONTENT_WIDTH, 86, "Top3 优先动作", actions)

  const listY = boxY - 210
  page.drawText("本包包含", { x: MARGIN_X, y: listY, size: 12, font, color: COLOR_ACCENT_DARK })
  const items = ["7天成交排产", "3条成交脚本", "10条高意图选题", "质检清单"]
  let bulletY = listY - 18
  items.forEach((item) => {
    page.drawText("•", { x: MARGIN_X, y: bulletY, size: 11, font, color: COLOR_TEXT })
    page.drawText(item, { x: MARGIN_X + 12, y: bulletY, size: 11, font, color: COLOR_TEXT })
    bulletY -= 18
  })
}

function addTocPage(doc: PDFDocument, font: PdfCursor["font"]) {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  drawCenteredText(page, font, "目录", PAGE_HEIGHT - 90, 20, COLOR_TEXT)
  const tocItems = [
    "一、成交结论",
    "二、7天成交排产",
    "三、成交脚本（3条）",
    "四、10条高意图选题",
    "五、交付质检清单",
    "六、下一步（可选）",
  ]
  let y = PAGE_HEIGHT - 150
  tocItems.forEach((item) => {
    page.drawText(item, { x: MARGIN_X, y, size: 12, font, color: COLOR_TEXT })
    page.drawLine({
      start: { x: MARGIN_X, y: y - 6 },
      end: { x: PAGE_WIDTH - MARGIN_X, y: y - 6 },
      thickness: 0.5,
      color: COLOR_LINE,
    })
    y -= 28
  })
}

function addFooters(doc: PDFDocument, font: PdfCursor["font"]) {
  const pages = doc.getPages()
  const total = pages.length
  pages.forEach((page, index) => {
    const label = `IP内容工厂 · 第 ${index + 1} / ${total} 页`
    const width = font.widthOfTextAtSize(label, 9)
    page.drawText(label, {
      x: PAGE_WIDTH - MARGIN_X - width,
      y: 28,
      size: 9,
      font,
      color: COLOR_MUTED,
    })
  })
}

export async function renderDeliveryPackPdf(
  input: DeliveryPackInput,
  output: DeliveryPackOutput
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create()
  pdfDoc.registerFontkit(fontkit)

  const fontPath = path.join(process.cwd(), "public", "fonts", "SimHei.ttf")
  const fontBytes = await fs.readFile(fontPath)
  const font = await pdfDoc.embedFont(fontBytes, { subset: true })

  addCoverPage(pdfDoc, font, input, output)
  addTocPage(pdfDoc, font)

  const cursor: PdfCursor = {
    doc: pdfDoc,
    page: pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    font,
    y: PAGE_HEIGHT - MARGIN_Y,
  }

  drawHeading(cursor, "一、成交结论")
  drawParagraph(cursor, `核心瓶颈：${output.scorecard.core_bottleneck}`, 12)
  drawLines(cursor, ["Top3 优先动作："], 12, 0, COLOR_TEXT, 6)
  drawBullets(cursor, output.scorecard.top_actions, 11)
  drawDivider(cursor)

  drawHeading(cursor, "二、7天成交排产")
  output.calendar_7d.forEach((item, index) => {
    drawSubheading(cursor, `Day ${index + 1}｜${item.theme}`)
    drawParagraph(cursor, `交付物：${item.deliverable}`, 11, 0, COLOR_TEXT, 4)
    if (item.notes) {
      drawParagraph(cursor, `Hook/CTA：${item.notes}`, 11, 0, COLOR_TEXT, 8)
    } else {
      cursor.y -= 6
    }
  })
  drawDivider(cursor)

  drawHeading(cursor, "三、成交脚本（3条）")
  output.scripts_3.forEach((script, index) => {
    drawSubheading(cursor, `脚本${index + 1}｜${script.title}`)
    drawParagraph(cursor, `开场钩子：${script.hook}`, 11, 0, COLOR_TEXT, 4)
    drawLines(cursor, ["结构："], 11, 0, COLOR_TEXT, 4)
    drawBullets(cursor, script.outline, 11)
    drawParagraph(cursor, `成交话术模板：${script.cta}`, 11, 0, COLOR_TEXT, 4)
    drawLines(cursor, ["极简分镜（3镜头）："], 11, 0, COLOR_TEXT, 4)
    drawBullets(cursor, buildStoryboardLines(script), 11)
  })
  drawDivider(cursor)

  drawHeading(cursor, "四、10条高意图选题")
  output.topic_bank_10.forEach((topic, index) => {
    drawSubheading(cursor, `${index + 1}. ${topic.title}`, 12)
    drawParagraph(cursor, `目标/意图：${topic.intent}`, 11, 0, COLOR_TEXT, 4)
    drawParagraph(cursor, `开场钩子：${topic.hook}`, 11, 0, COLOR_TEXT, 8)
  })
  drawDivider(cursor)

  drawHeading(cursor, "五、交付质检清单（10条）")
  drawBullets(cursor, output.qc_checklist_10, 11)

  drawHeading(cursor, "六、下一步（可选）")
  drawBullets(cursor, ["把脚本1今日发布并截图数据", "按排产执行7天并复盘转化"], 11)

  addFooters(pdfDoc, font)

  const pdfBytes = await pdfDoc.save()
  return Buffer.from(pdfBytes)
}
