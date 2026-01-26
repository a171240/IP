import { DeliveryPackInput, DeliveryPackOutput } from "./schema"

export type DeliveryFile = {
  name: string
  buffer: Buffer
  contentType: string
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ")
}

function renderScorecardMd(output: DeliveryPackOutput): Buffer {
  const lines: string[] = []
  lines.push("\u4ea4\u4ed8\u4f53\u68c0\u5355\uff08\u4e94\u7ef4\u8bc4\u5206\uff09")
  lines.push("")
  lines.push("\u7ef4\u5ea6\u8bc4\u5206")
  output.scorecard.dimensions.forEach((dim) => {
    lines.push(`- \u540d\u79f0\uff1a${dim.name}  | \u8bc4\u5206\uff1a${dim.score}/10`)
    lines.push(`  - \u6d1e\u5bdf\uff1a${dim.insight}`)
  })
  lines.push("")
  lines.push(`**\u6838\u5fc3\u74f6\u9888\uff1a** ${output.scorecard.core_bottleneck}`)
  lines.push("")
  lines.push("**Top3 \u52a8\u4f5c\uff1a**")
  output.scorecard.top_actions.forEach((item) => lines.push(`- ${item}`))
  lines.push("")
  return Buffer.from(lines.join("\n"), "utf-8")
}

function renderCalendarMd(output: DeliveryPackOutput): Buffer {
  const lines: string[] = []
  lines.push("\u0037\u5929\u5185\u5bb9\u65e5\u5386")
  lines.push("")
  lines.push("| Day | \u4e3b\u9898 | \u4ea4\u4ed8\u7269 | \u5907\u6ce8 |")
  lines.push("| --- | --- | --- | --- |")
  output.calendar_7d.forEach((item) => {
    lines.push(
      `| ${escapeTableCell(item.day)} | ${escapeTableCell(item.theme)} | ${escapeTableCell(
        item.deliverable
      )} | ${escapeTableCell(item.notes || "")} |`
    )
  })
  lines.push("")
  return Buffer.from(lines.join("\n"), "utf-8")
}

function renderTopicsMd(output: DeliveryPackOutput): Buffer {
  const lines: string[] = []
  lines.push("\u9009\u9898\u5e93\uff08\u0031\u0030\u6761\u9ad8\u610f\u56fe\uff09")
  lines.push("")
  lines.push("| \u6807\u9898 | \u610f\u56fe | \u94a9\u5b50 |")
  lines.push("| --- | --- | --- |")
  output.topic_bank_10.forEach((item) => {
    lines.push(
      `| ${escapeTableCell(item.title)} | ${escapeTableCell(item.intent)} | ${escapeTableCell(
        item.hook
      )} |`
    )
  })
  lines.push("")
  return Buffer.from(lines.join("\n"), "utf-8")
}

function renderScriptsMd(output: DeliveryPackOutput): Buffer {
  const lines: string[] = []
  lines.push("\u53ef\u62cd\u811a\u672c\uff08\u0033\u6761\uff09")
  lines.push("")

  output.scripts_3.forEach((script, index) => {
    lines.push(`## \u811a\u672c ${index + 1}\uff1a${script.title}`)
    lines.push(`\u5f00\u573a\u94a9\u5b50\uff1a${script.hook}`)
    lines.push("")
    lines.push("### \u7ed3\u6784")
    script.outline.forEach((line) => lines.push(`- ${line}`))
    lines.push("")
    lines.push(`CTA\uff1a${script.cta}`)
    lines.push("")
  })

  return Buffer.from(lines.join("\n"), "utf-8")
}

function renderChecklistMd(output: DeliveryPackOutput): Buffer {
  const lines: string[] = []
  lines.push("\u53d1\u5e03\u8d28\u68c0\u6e05\u5355\uff08\u0031\u0030\u9879\uff09")
  lines.push("")
  output.qc_checklist_10.forEach((item) => lines.push(`- [ ] ${item}`))
  lines.push("")
  return Buffer.from(lines.join("\n"), "utf-8")
}

function renderReadme(input: DeliveryPackInput, output: DeliveryPackOutput): Buffer {
  const lines: string[] = []
  lines.push("\u4ea4\u4ed8\u5305\u5f00\u59cb\u4f7f\u7528")
  lines.push("")
  lines.push("\u8fd9\u662f\u4e00\u4efd\u57fa\u4e8e\u8bca\u65ad\u751f\u6210\u7684\u4ea4\u4ed8\u5305\uff0c\u5305\u542b \u0037 \u5929\u6392\u4ea7\u3001\u811a\u672c\u4e0e\u8d28\u68c0\u6e05\u5355\u3002")
  lines.push("")
  lines.push("## \u6838\u5fc3\u4fe1\u606f")
  lines.push(`- \u884c\u4e1a\uff1a${input.industry}`)
  lines.push(`- \u5e73\u53f0\uff1a${input.platform}`)
  lines.push(`- \u76ee\u6807\uff1a${input.goal}`)
  lines.push("")
  lines.push("## \u6587\u4ef6\u6e05\u5355")
  lines.push("- 01_\u4ea4\u4ed8\u4f53\u68c0\u5355_\u4e94\u7ef4\u8bc4\u5206.md")
  lines.push("- 02_\u0037\u5929\u5185\u5bb9\u65e5\u5386.md")
  lines.push("- 03_\u9009\u9898\u5e93_\u0031\u0030\u6761\u9ad8\u610f\u56fe.md")
  lines.push("- 04_\u53ef\u62cd\u811a\u672c_\u0033\u6761.md")
  lines.push("- 05_\u53d1\u5e03\u8d28\u68c0\u6e05\u5355_\u0031\u0030\u9879.md")
  lines.push("")
  lines.push(`\u6838\u5fc3\u74f6\u9888\uff1a${output.scorecard.core_bottleneck}`)
  lines.push("")
  return Buffer.from(lines.join("\n"), "utf-8")
}

export async function renderDeliveryPackFiles(
  input: DeliveryPackInput,
  output: DeliveryPackOutput
): Promise<DeliveryFile[]> {
  const files: DeliveryFile[] = []

  files.push({
    name: "README_\u5f00\u59cb\u4f7f\u7528.md",
    buffer: renderReadme(input, output),
    contentType: "text/markdown",
  })

  files.push({
    name: "01_\u4ea4\u4ed8\u4f53\u68c0\u5355_\u4e94\u7ef4\u8bc4\u5206.md",
    buffer: renderScorecardMd(output),
    contentType: "text/markdown",
  })

  files.push({
    name: "02_\u0037\u5929\u5185\u5bb9\u65e5\u5386.md",
    buffer: renderCalendarMd(output),
    contentType: "text/markdown",
  })

  files.push({
    name: "03_\u9009\u9898\u5e93_\u0031\u0030\u6761\u9ad8\u610f\u56fe.md",
    buffer: renderTopicsMd(output),
    contentType: "text/markdown",
  })

  files.push({
    name: "04_\u53ef\u62cd\u811a\u672c_\u0033\u6761.md",
    buffer: renderScriptsMd(output),
    contentType: "text/markdown",
  })

  files.push({
    name: "05_\u53d1\u5e03\u8d28\u68c0\u6e05\u5355_\u0031\u0030\u9879.md",
    buffer: renderChecklistMd(output),
    contentType: "text/markdown",
  })

  return files
}
