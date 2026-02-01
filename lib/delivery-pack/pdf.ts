import { PDFDocument, rgb } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import fs from "fs/promises"
import path from "path"
import { DeliveryPackInput, DeliveryPackOutput } from "./schema"

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN_X = 44
const MARGIN_Y = 56
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2

const COLOR_TEXT = rgb(0.12, 0.12, 0.14)
const COLOR_MUTED = rgb(0.45, 0.48, 0.52)
const COLOR_PRIMARY = rgb(0.05, 0.65, 0.55)
const COLOR_PRIMARY_DARK = rgb(0.02, 0.45, 0.38)
const COLOR_CARD = rgb(0.96, 0.98, 0.99)
const COLOR_BORDER = rgb(0.9, 0.92, 0.94)
const COLOR_DARK = rgb(0.05, 0.06, 0.07)
const COLOR_ACCENT = rgb(0.1, 0.75, 0.6)

type PdfCursor = {
  doc: PDFDocument
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>
}

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

function formatDate(value = new Date()): string {
  const year = value.getFullYear()
  const month = `${value.getMonth() + 1}`.padStart(2, "0")
  const day = `${value.getDate()}`.padStart(2, "0")
  return `${year}.${month}.${day}`
}

function drawWrappedText(params: {
  page: ReturnType<PDFDocument["addPage"]>
  font: PdfCursor["font"]
  text: string
  x: number
  y: number
  size: number
  maxWidth: number
  lineHeight?: number
  color?: ReturnType<typeof rgb>
}): number {
  const { page, font, text, x, y, size, maxWidth, lineHeight = size + 6, color = COLOR_TEXT } = params
  const lines = wrapText(text, font, size, maxWidth)
  let cursorY = y
  lines.forEach((line) => {
    page.drawText(line, { x, y: cursorY, size, font, color })
    cursorY -= lineHeight
  })
  return cursorY
}

function clampLines(lines: string[], maxLines: number): string[] {
  if (lines.length <= maxLines) return lines
  const clipped = lines.slice(0, maxLines)
  const lastIndex = clipped.length - 1
  const last = clipped[lastIndex] ?? ""
  const ellipsis = "..."
  clipped[lastIndex] = last.length > 1 ? `${last.slice(0, last.length - 1)}${ellipsis}` : ellipsis
  return clipped
}


function clipText(text: string, maxLength: number): string {
  if (!text) return ""
  if (text.length <= maxLength) return text
  const keep = Math.max(0, maxLength - 3)
  return `${text.slice(0, keep)}...`
}

function drawWrappedTextClamped(params: {
  page: ReturnType<PDFDocument["addPage"]>
  font: PdfCursor["font"]
  text: string
  x: number
  y: number
  size: number
  maxWidth: number
  maxLines: number
  lineHeight?: number
  color?: ReturnType<typeof rgb>
}): number {
  const { page, font, text, x, y, size, maxWidth, maxLines, lineHeight = size + 6, color = COLOR_TEXT } = params
  const lines = clampLines(wrapText(text, font, size, maxWidth), maxLines)
  let cursorY = y
  lines.forEach((line) => {
    page.drawText(line, { x, y: cursorY, size, font, color })
    cursorY -= lineHeight
  })
  return cursorY
}

function drawSectionTitle(
  page: ReturnType<PDFDocument["addPage"]>,
  font: PdfCursor["font"],
  text: string,
  y: number
): number {
  page.drawText(text, { x: MARGIN_X, y, size: 16, font, color: COLOR_TEXT })
  page.drawLine({
    start: { x: MARGIN_X, y: y - 8 },
    end: { x: MARGIN_X + 140, y: y - 8 },
    thickness: 2,
    color: COLOR_PRIMARY,
  })
  return y - 26
}

function drawCard(
  page: ReturnType<PDFDocument["addPage"]>,
  x: number,
  y: number,
  width: number,
  height: number
) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: COLOR_CARD,
    borderColor: COLOR_BORDER,
    borderWidth: 1,
  })
}

function drawPill(
  page: ReturnType<PDFDocument["addPage"]>,
  font: PdfCursor["font"],
  text: string,
  x: number,
  y: number
) {
  const paddingX = 8
  const paddingY = 4
  const fontSize = 10
  const textWidth = font.widthOfTextAtSize(text, fontSize)
  const width = textWidth + paddingX * 2
  const height = fontSize + paddingY * 2
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: rgb(0.9, 0.98, 0.96),
    borderColor: COLOR_PRIMARY,
    borderWidth: 1,
  })
  page.drawText(text, {
    x: x + paddingX,
    y: y + paddingY,
    size: fontSize,
    font,
    color: COLOR_PRIMARY_DARK,
  })
}

function addFooter(page: ReturnType<PDFDocument["addPage"]>, font: PdfCursor["font"], index: number, total: number) {
  const label = `IP内容工厂 - 第${index + 1} / ${total} 页`
  const width = font.widthOfTextAtSize(label, 9)
  page.drawText(label, {
    x: PAGE_WIDTH - MARGIN_X - width,
    y: 26,
    size: 9,
    font,
    color: COLOR_MUTED,
  })
}

function buildTomorrowBlock(output: DeliveryPackOutput) {
  const dayOne = output.calendar_7d[0]
  return {
    title: dayOne.title,
    hook: dayOne.hook,
    outline: dayOne.outline,
    cta: dayOne.cta,
  }
}

function addCoverPage(cursor: PdfCursor, input: DeliveryPackInput, output: DeliveryPackOutput) {
  const page = cursor.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: rgb(0.98, 0.99, 1) })
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 240, width: PAGE_WIDTH, height: 240, color: COLOR_DARK })
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 240, width: PAGE_WIDTH, height: 6, color: COLOR_ACCENT })

  page.drawText("内容交付系统诊断", {
    x: MARGIN_X,
    y: PAGE_HEIGHT - 110,
    size: 30,
    font: cursor.font,
    color: rgb(1, 1, 1),
  })
  page.drawText("7天高价值交付包（PDF）", {
    x: MARGIN_X,
    y: PAGE_HEIGHT - 150,
    size: 18,
    font: cursor.font,
    color: rgb(0.85, 0.88, 0.9),
  })
  page.drawText("移动端优先 - 一份PDF即可执行", {
    x: MARGIN_X,
    y: PAGE_HEIGHT - 176,
    size: 12,
    font: cursor.font,
    color: rgb(0.7, 0.74, 0.78),
  })

  const metaLine = [
    `团队：${output.meta.team_type || input.team_type}`,
    `平台：${output.meta.platform || input.platform}`,
    `行业：${output.meta.industry || input.industry}`,
  ]
  drawWrappedTextClamped({
    page,
    font: cursor.font,
    text: metaLine.join("  -  "),
    x: MARGIN_X,
    y: PAGE_HEIGHT - 210,
    size: 10,
    maxWidth: CONTENT_WIDTH,
    maxLines: 2,
    lineHeight: 14,
    color: rgb(0.7, 0.74, 0.78),
  })

  page.drawText(`生成日期：${formatDate()}`, {
    x: MARGIN_X,
    y: 90,
    size: 10,
    font: cursor.font,
    color: COLOR_MUTED,
  })

  page.drawText("IP内容工厂", {
    x: MARGIN_X,
    y: 64,
    size: 12,
    font: cursor.font,
    color: COLOR_TEXT,
  })
}

function addTocPage(cursor: PdfCursor, input: DeliveryPackInput, output: DeliveryPackOutput) {
  const page = cursor.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  page.drawText("目录", {
    x: MARGIN_X,
    y: PAGE_HEIGHT - 90,
    size: 22,
    font: cursor.font,
    color: COLOR_TEXT,
  })
  page.drawText("快速定位每一页交付内容", {
    x: MARGIN_X,
    y: PAGE_HEIGHT - 120,
    size: 11,
    font: cursor.font,
    color: COLOR_MUTED,
  })
  page.drawRectangle({ x: MARGIN_X, y: PAGE_HEIGHT - 138, width: 48, height: 4, color: COLOR_ACCENT })

  const meta = [
    `团队：${output.meta.team_type || input.team_type}`,
    `平台：${output.meta.platform || input.platform}`,
    `行业：${output.meta.industry || input.industry}`,
  ]
  drawWrappedTextClamped({
    page,
    font: cursor.font,
    text: meta.join("  -  "),
    x: MARGIN_X,
    y: PAGE_HEIGHT - 165,
    size: 10,
    maxWidth: CONTENT_WIDTH,
    maxLines: 2,
    lineHeight: 14,
    color: COLOR_MUTED,
  })

  return page
}

function fillTocPage(
  page: ReturnType<PDFDocument["addPage"]>,
  font: PdfCursor["font"],
  sections: { title: string; pageIndex: number }[]
) {
  let y = PAGE_HEIGHT - 210
  sections.forEach((section) => {
    const pageNumber = `${section.pageIndex + 1}`
    const numberWidth = font.widthOfTextAtSize(pageNumber, 11)
    const dotStart = MARGIN_X + 120
    const dotEnd = PAGE_WIDTH - MARGIN_X - numberWidth - 8

    page.drawText(section.title, {
      x: MARGIN_X,
      y,
      size: 12,
      font,
      color: COLOR_TEXT,
    })

    page.drawLine({
      start: { x: dotStart, y: y + 4 },
      end: { x: dotEnd, y: y + 4 },
      thickness: 1,
      color: COLOR_BORDER,
    })

    page.drawText(pageNumber, {
      x: PAGE_WIDTH - MARGIN_X - numberWidth,
      y,
      size: 11,
      font,
      color: COLOR_MUTED,
    })

    y -= 24
  })
}

function addSummaryPage(cursor: PdfCursor, input: DeliveryPackInput, output: DeliveryPackOutput) {
  const page = cursor.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])

  let y = PAGE_HEIGHT - MARGIN_Y
  page.drawText("一页结论", { x: MARGIN_X, y, size: 20, font: cursor.font, color: COLOR_TEXT })
  page.drawText(`生成日期：${formatDate()}`, {
    x: PAGE_WIDTH - MARGIN_X - 90,
    y: y + 2,
    size: 9,
    font: cursor.font,
    color: COLOR_MUTED,
  })
  y -= 22
  page.drawLine({
    start: { x: MARGIN_X, y },
    end: { x: MARGIN_X + 120, y },
    thickness: 3,
    color: COLOR_PRIMARY,
  })
  y -= 24

  y = drawSectionTitle(page, cursor.font, "核心瓶颈", y)
  y = drawWrappedTextClamped({
    page,
    font: cursor.font,
    text: output.bottleneck,
    x: MARGIN_X,
    y,
    size: 12,
    maxWidth: CONTENT_WIDTH,
    maxLines: 6,
    lineHeight: 17,
  })

  y -= 10
  y = drawSectionTitle(page, cursor.font, "7天只做3件事", y)
  y -= 4
  output.top_actions.slice(0, 3).forEach((item, index) => {
    const title = `${index + 1}. ${item.title}`
    y = drawWrappedTextClamped({
      page,
      font: cursor.font,
      text: title,
      x: MARGIN_X,
      y,
      size: 12,
      maxWidth: CONTENT_WIDTH,
      maxLines: 5,
      lineHeight: 18,
      color: COLOR_PRIMARY_DARK,
    })
    y = drawWrappedTextClamped({
      page,
      font: cursor.font,
      text: `原因：${item.why}`,
      x: MARGIN_X + 16,
      y,
      size: 10,
      maxWidth: CONTENT_WIDTH - 16,
      maxLines: 6,
      lineHeight: 14,
      color: COLOR_MUTED,
    })
    y -= 6
  })

  y = drawSectionTitle(page, cursor.font, "明天第一条发什么", y)
  y -= 6
  const tomorrow = buildTomorrowBlock(output)
  const cardHeight = 260
  drawCard(page, MARGIN_X, y - cardHeight + 8, CONTENT_WIDTH, cardHeight)
  let cardY = y - 24
  cardY = drawWrappedTextClamped({
    page,
    font: cursor.font,
    text: `标题：${tomorrow.title}`,
    x: MARGIN_X + 16,
    y: cardY,
    size: 12,
    maxWidth: CONTENT_WIDTH - 32,
    maxLines: 4,
    lineHeight: 18,
  })
  cardY = drawWrappedTextClamped({
    page,
    font: cursor.font,
    text: `3秒钩子：${tomorrow.hook}`,
    x: MARGIN_X + 16,
    y: cardY,
    size: 11,
    maxWidth: CONTENT_WIDTH - 32,
    maxLines: 3,
    lineHeight: 16,
  })
  cardY = drawWrappedTextClamped({
    page,
    font: cursor.font,
    text: `结构：${tomorrow.outline.join(" / ")}`,
    x: MARGIN_X + 16,
    y: cardY,
    size: 10,
    maxWidth: CONTENT_WIDTH - 32,
    maxLines: 4,
    lineHeight: 14,
    color: COLOR_MUTED,
  })
  cardY = drawWrappedTextClamped({
    page,
    font: cursor.font,
    text: `CTA：${tomorrow.cta}`,
    x: MARGIN_X + 16,
    y: cardY,
    size: 11,
    maxWidth: CONTENT_WIDTH - 32,
    maxLines: 2,
    lineHeight: 16,
    color: COLOR_PRIMARY_DARK,
  })
}

function addTomorrowPostPage(cursor: PdfCursor, output: DeliveryPackOutput) {
  const page = cursor.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN_Y
  y = drawSectionTitle(page, cursor.font, "明天第一条完整文案", y)
  y -= 6

  const post = output.tomorrow_post
  const cardHeight = 520
  drawCard(page, MARGIN_X, y - cardHeight + 8, CONTENT_WIDTH, cardHeight)

  let cardY = y - 24
  cardY = drawWrappedTextClamped({
    page,
    font: cursor.font,
    text: `标题：${post.title}`,
    x: MARGIN_X + 16,
    y: cardY,
    size: 12,
    maxWidth: CONTENT_WIDTH - 32,
    maxLines: 3,
    lineHeight: 18,
  })
  cardY -= 6
  cardY = drawWrappedTextClamped({
    page,
    font: cursor.font,
    text: `封面文字：${post.cover_text}`,
    x: MARGIN_X + 16,
    y: cardY,
    size: 11,
    maxWidth: CONTENT_WIDTH - 32,
    maxLines: 2,
    lineHeight: 16,
    color: COLOR_MUTED,
  })
  cardY -= 6
  cardY = drawWrappedTextClamped({
    page,
    font: cursor.font,
    text: `正文：${post.body}`,
    x: MARGIN_X + 16,
    y: cardY,
    size: 11,
    maxWidth: CONTENT_WIDTH - 32,
    maxLines: 12,
    lineHeight: 16,
  })
  cardY -= 6
  drawWrappedTextClamped({
    page,
    font: cursor.font,
    text: `置顶评论：${post.pinned_comment}`,
    x: MARGIN_X + 16,
    y: cardY,
    size: 11,
    maxWidth: CONTENT_WIDTH - 32,
    maxLines: 3,
    lineHeight: 16,
    color: COLOR_PRIMARY_DARK,
  })
}

function addScorePage(cursor: PdfCursor, output: DeliveryPackOutput) {
  const page = cursor.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN_Y
  y = drawSectionTitle(page, cursor.font, "五维评分（0-10）", y)

  output.scores.forEach((item) => {
    const cardHeight = 96
    drawCard(page, MARGIN_X, y - cardHeight + 8, CONTENT_WIDTH, cardHeight)
    page.drawText(`${item.dimension} - ${item.score}/10`, {
      x: MARGIN_X + 16,
      y: y - 18,
      size: 12,
      font: cursor.font,
      color: COLOR_TEXT,
    })
    drawWrappedTextClamped({
      page,
      font: cursor.font,
      text: `现状：${item.insight}`,
      x: MARGIN_X + 16,
      y: y - 38,
      size: 10,
      maxWidth: CONTENT_WIDTH - 32,
      maxLines: 2,
      lineHeight: 14,
      color: COLOR_MUTED,
    })
    drawWrappedTextClamped({
      page,
      font: cursor.font,
      text: `解决：${item.fix}`,
      x: MARGIN_X + 16,
      y: y - 60,
      size: 10,
      maxWidth: CONTENT_WIDTH - 32,
      maxLines: 2,
      lineHeight: 14,
      color: COLOR_PRIMARY_DARK,
    })
    y -= cardHeight + 10
  })
}

function addCalendarPages(cursor: PdfCursor, output: DeliveryPackOutput) {
  const items = output.calendar_7d
  const perPage = 2
  for (let start = 0; start < items.length; start += perPage) {
    const page = cursor.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    let y = PAGE_HEIGHT - MARGIN_Y
    y = drawSectionTitle(page, cursor.font, "7天成交排产", y)
    const slice = items.slice(start, start + perPage)
    slice.forEach((item) => {
      const cardHeight = 320
      drawCard(page, MARGIN_X, y - cardHeight + 8, CONTENT_WIDTH, cardHeight)
      drawPill(page, cursor.font, item.type, MARGIN_X + 16, y - 28)

      let titleY = y - 26
      titleY = drawWrappedTextClamped({
        page,
        font: cursor.font,
        text: `第${item.day}天 - ${item.title}`,
        x: MARGIN_X + 90,
        y: titleY,
        size: 12,
        maxWidth: CONTENT_WIDTH - 110,
        maxLines: 4,
        lineHeight: 16,
        color: COLOR_TEXT,
      })

      let lineY = titleY - 6
      lineY = drawWrappedTextClamped({
        page,
        font: cursor.font,
        text: `3秒钩子：${item.hook}`,
        x: MARGIN_X + 16,
        y: lineY,
        size: 10,
        maxWidth: CONTENT_WIDTH - 32,
        maxLines: 3,
        lineHeight: 14,
      })

      lineY -= 2
      lineY = drawWrappedTextClamped({
        page,
        font: cursor.font,
        text: "结构要点：",
        x: MARGIN_X + 16,
        y: lineY,
        size: 9,
        maxWidth: CONTENT_WIDTH - 32,
        maxLines: 1,
        lineHeight: 13,
        color: COLOR_MUTED,
      })
      const outlineList = Array.isArray(item.outline) ? item.outline.slice(0, 3) : []
      outlineList.forEach((point) => {
        lineY = drawWrappedTextClamped({
          page,
          font: cursor.font,
          text: `- ${point}`,
          x: MARGIN_X + 28,
          y: lineY,
          size: 9,
          maxWidth: CONTENT_WIDTH - 44,
          maxLines: 2,
          lineHeight: 12,
          color: COLOR_MUTED,
        })
        lineY -= 2
      })

      lineY -= 2
      drawWrappedTextClamped({
        page,
        font: cursor.font,
        text: `CTA：${item.cta} - 脚本 ${item.script_id}`,
        x: MARGIN_X + 16,
        y: lineY,
        size: 10,
        maxWidth: CONTENT_WIDTH - 32,
        maxLines: 4,
        lineHeight: 14,
        color: COLOR_PRIMARY_DARK,
      })
      y -= cardHeight + 12
    })
  }
}

function addTopicsPages(cursor: PdfCursor, output: DeliveryPackOutput) {
  const items = output.topics_10
  const perPage = 2
  for (let pageIndex = 0; pageIndex < Math.ceil(items.length / perPage); pageIndex += 1) {
    const page = cursor.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    let y = PAGE_HEIGHT - MARGIN_Y
    y = drawSectionTitle(page, cursor.font, "10条高意图选题", y)
    const slice = items.slice(pageIndex * perPage, pageIndex * perPage + perPage)
    slice.forEach((item, index) => {
      const cardHeight = 240
      drawCard(page, MARGIN_X, y - cardHeight + 8, CONTENT_WIDTH, cardHeight)
      drawPill(page, cursor.font, item.type, MARGIN_X + 16, y - 26)
      let titleY = y - 26
      titleY = drawWrappedTextClamped({
        page,
        font: cursor.font,
        text: `${pageIndex * perPage + index + 1}. ${item.title}`,
        x: MARGIN_X + 86,
        y: titleY,
        size: 12,
        maxWidth: CONTENT_WIDTH - 110,
        maxLines: 4,
        lineHeight: 16,
        color: COLOR_TEXT,
      })
      let lineY = titleY - 6
      lineY = drawWrappedTextClamped({
        page,
        font: cursor.font,
        text: `人群：${item.audience} | 场景：${item.scene}`,
        x: MARGIN_X + 16,
        y: lineY,
        size: 10,
        maxWidth: CONTENT_WIDTH - 32,
        maxLines: 2,
        lineHeight: 14,
        color: COLOR_MUTED,
      })
      lineY -= 2
      lineY = drawWrappedTextClamped({
        page,
        font: cursor.font,
        text: `痛点：${item.pain}`,
        x: MARGIN_X + 16,
        y: lineY,
        size: 10,
        maxWidth: CONTENT_WIDTH - 32,
        maxLines: 2,
        lineHeight: 14,
      })
      lineY -= 2
      lineY = drawWrappedTextClamped({
        page,
        font: cursor.font,
        text: `关键词：${item.keywords.join(" / ")}`,
        x: MARGIN_X + 16,
        y: lineY,
        size: 10,
        maxWidth: CONTENT_WIDTH - 32,
        maxLines: 2,
        lineHeight: 14,
        color: COLOR_PRIMARY_DARK,
      })
      lineY -= 2
      drawWrappedTextClamped({
        page,
        font: cursor.font,
        text: `CTA：${item.cta}`,
        x: MARGIN_X + 16,
        y: lineY,
        size: 10,
        maxWidth: CONTENT_WIDTH - 32,
        maxLines: 2,
        lineHeight: 14,
        color: COLOR_PRIMARY_DARK,
      })
      y -= cardHeight + 12
    })
  }
}

function addScriptsPages(cursor: PdfCursor, output: DeliveryPackOutput) {
  output.scripts_3.forEach((script) => {
    const page = cursor.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    let y = PAGE_HEIGHT - MARGIN_Y
    y = drawSectionTitle(page, cursor.font, `${script.id} 脚本 - ${script.type}`, y)
    page.drawText(`时长：${script.duration}`, {
      x: MARGIN_X,
      y: y,
      size: 10,
      font: cursor.font,
      color: COLOR_MUTED,
    })
    y -= 20

    const cardHeight = 320
    drawCard(page, MARGIN_X, y - cardHeight + 8, CONTENT_WIDTH, cardHeight)
    let cardY = y - 24
    script.shots.slice(0, 3).forEach((shot) => {
      cardY = drawWrappedTextClamped({
        page,
        font: cursor.font,
        text: `${shot.t}-${shot.line}`,
        x: MARGIN_X + 16,
        y: cardY,
        size: 11,
        maxWidth: CONTENT_WIDTH - 32,
        maxLines: 3,
        lineHeight: 16,
      })
      cardY = drawWrappedTextClamped({
        page,
        font: cursor.font,
        text: `画面：${shot.visual}`,
        x: MARGIN_X + 28,
        y: cardY,
        size: 10,
        maxWidth: CONTENT_WIDTH - 44,
        maxLines: 2,
        lineHeight: 14,
        color: COLOR_MUTED,
      })
      cardY -= 4
    })

    y -= cardHeight + 16
    y = drawWrappedTextClamped({
      page,
      font: cursor.font,
      text: `成交话术（CTA）：${script.cta}`,
      x: MARGIN_X,
      y,
      size: 11,
      maxWidth: CONTENT_WIDTH,
      maxLines: 5,
      lineHeight: 16,
      color: COLOR_PRIMARY_DARK,
    })
    y -= 6

    y = drawWrappedTextClamped({
      page,
      font: cursor.font,
      text: `标题备选：${script.title_options.join(" / ")}`,
      x: MARGIN_X,
      y,
      size: 10,
      maxWidth: CONTENT_WIDTH,
      maxLines: 5,
      lineHeight: 14,
      color: COLOR_MUTED,
    })

    y -= 6
    drawWrappedTextClamped({
      page,
      font: cursor.font,
      text: `置顶评论：${script.pinned_comment}`,
      x: MARGIN_X,
      y,
      size: 10,
      maxWidth: CONTENT_WIDTH,
      maxLines: 5,
      lineHeight: 14,
    })
  })
}

function addChecklistPage(cursor: PdfCursor, output: DeliveryPackOutput) {
  const page = cursor.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN_Y
  y = drawSectionTitle(page, cursor.font, "发布质检清单（可打勾）", y)

  const blocks = [
    { title: "标题检查", items: output.qc_checklist.title },
    { title: "结构检查", items: output.qc_checklist.body },
    { title: "CTA与合规", items: output.qc_checklist.cta_and_compliance },
  ]

  blocks.forEach((block) => {
    const cardHeight = 150
    drawCard(page, MARGIN_X, y - cardHeight + 8, CONTENT_WIDTH, cardHeight)
    page.drawText(block.title, {
      x: MARGIN_X + 16,
      y: y - 24,
      size: 12,
      font: cursor.font,
      color: COLOR_TEXT,
    })
    let listY = y - 44
    block.items.slice(0, 3).forEach((item) => {
      page.drawText("-", {
        x: MARGIN_X + 16,
        y: listY,
        size: 11,
        font: cursor.font,
        color: COLOR_PRIMARY_DARK,
      })
      listY = drawWrappedTextClamped({
        page,
        font: cursor.font,
        text: item,
        x: MARGIN_X + 32,
        y: listY,
        size: 10,
        maxWidth: CONTENT_WIDTH - 48,
        maxLines: 2,
        lineHeight: 14,
      })
      listY -= 2
    })
    y -= cardHeight + 10
  })
}

function addArchivePage(cursor: PdfCursor, output: DeliveryPackOutput) {
  const page = cursor.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN_Y
  y = drawSectionTitle(page, cursor.font, "归档与去重规则", y)

  const cardHeight = 150
  drawCard(page, MARGIN_X, y - cardHeight + 8, CONTENT_WIDTH, cardHeight)
  drawWrappedTextClamped({
    page,
    font: cursor.font,
    text: `命名规范：${output.archive_rules.naming}`,
    x: MARGIN_X + 16,
    y: y - 28,
    size: 11,
    maxWidth: CONTENT_WIDTH - 32,
    maxLines: 2,
    lineHeight: 16,
  })
  drawWrappedTextClamped({
    page,
    font: cursor.font,
    text: `标签体系：${output.archive_rules.tags.join(" / ")}`,
    x: MARGIN_X + 16,
    y: y - 56,
    size: 10,
    maxWidth: CONTENT_WIDTH - 32,
    maxLines: 2,
    lineHeight: 14,
    color: COLOR_MUTED,
  })
  drawWrappedTextClamped({
    page,
    font: cursor.font,
    text: `去重规则：${output.archive_rules.dedupe.join(" / ")}`,
    x: MARGIN_X + 16,
    y: y - 84,
    size: 10,
    maxWidth: CONTENT_WIDTH - 32,
    maxLines: 2,
    lineHeight: 14,
    color: COLOR_MUTED,
  })
}

function addUpsellPage(cursor: PdfCursor, output: DeliveryPackOutput) {
  const page = cursor.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN_Y
  y = drawSectionTitle(page, cursor.font, "升级建议", y)
  const cardHeight = 200
  drawCard(page, MARGIN_X, y - cardHeight + 8, CONTENT_WIDTH, cardHeight)
  let listY = y - 32
  output.upsell.when_to_upgrade.slice(0, 3).forEach((item) => {
    page.drawText("-", {
      x: MARGIN_X + 16,
      y: listY,
      size: 12,
      font: cursor.font,
      color: COLOR_PRIMARY_DARK,
    })
    listY = drawWrappedTextClamped({
      page,
      font: cursor.font,
      text: item,
      x: MARGIN_X + 32,
      y: listY,
      size: 11,
      maxWidth: CONTENT_WIDTH - 48,
      maxLines: 2,
      lineHeight: 16,
    })
    listY -= 2
  })

  const cardBottom = y - cardHeight + 20
  const ctaY = Math.max(listY - 6, cardBottom)
  drawWrappedTextClamped({
    page,
    font: cursor.font,
    text: output.upsell.cta,
    x: MARGIN_X + 16,
    y: ctaY,
    size: 12,
    maxWidth: CONTENT_WIDTH - 32,
    maxLines: 2,
    lineHeight: 18,
    color: COLOR_PRIMARY_DARK,
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

  const cursor: PdfCursor = { doc: pdfDoc, font }
  const sections: { title: string; pageIndex: number }[] = []

  addCoverPage(cursor, input, output)
  const tocPage = addTocPage(cursor, input, output)

  const summaryStart = pdfDoc.getPageCount()
  addSummaryPage(cursor, input, output)
  sections.push({ title: "一页结论", pageIndex: summaryStart })

  const tomorrowStart = pdfDoc.getPageCount()
  addTomorrowPostPage(cursor, output)
  sections.push({ title: "明天第一条完整文案", pageIndex: tomorrowStart })

  const scoreStart = pdfDoc.getPageCount()
  addScorePage(cursor, output)
  sections.push({ title: "五维评分（0-10）", pageIndex: scoreStart })

  const calendarStart = pdfDoc.getPageCount()
  addCalendarPages(cursor, output)
  sections.push({ title: "7天成交排产", pageIndex: calendarStart })

  const topicsStart = pdfDoc.getPageCount()
  addTopicsPages(cursor, output)
  sections.push({ title: "10条高意图选题", pageIndex: topicsStart })

  const scriptsStart = pdfDoc.getPageCount()
  addScriptsPages(cursor, output)
  sections.push({ title: "成交脚本（S1-S3）", pageIndex: scriptsStart })

  const checklistStart = pdfDoc.getPageCount()
  addChecklistPage(cursor, output)
  sections.push({ title: "发布质检清单", pageIndex: checklistStart })

  const archiveStart = pdfDoc.getPageCount()
  addArchivePage(cursor, output)
  sections.push({ title: "归档与去重规则", pageIndex: archiveStart })

  const upsellStart = pdfDoc.getPageCount()
  addUpsellPage(cursor, output)
  sections.push({ title: "升级建议", pageIndex: upsellStart })

  fillTocPage(tocPage, font, sections)

  const pages = pdfDoc.getPages()
  pages.forEach((page, index) => {
    if (index < 2) return
    addFooter(page, font, index, pages.length)
  })

  const pdfBytes = await pdfDoc.save()
  return Buffer.from(pdfBytes)
}
