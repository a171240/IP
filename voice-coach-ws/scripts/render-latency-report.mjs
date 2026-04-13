import fs from "node:fs/promises"
import path from "node:path"
import process from "node:process"

import {
  formatMs,
  getStringArg,
  parseArgs,
  resolveOutputPath,
  shortId,
  toStatusEmoji,
  writeTextFile,
} from "./lib/tooling-utils.mjs"

function renderMetricTable(summary) {
  const rows = Object.entries(summary)
    .map(
      ([name, values]) =>
        `| ${name} | ${values.count} | ${formatMs(values.min)} | ${formatMs(values.p50)} | ${formatMs(values.p90)} | ${formatMs(values.p99)} | ${formatMs(values.max)} | ${formatMs(values.avg)} |`,
    )
    .join("\n")

  return [
    "| Metric | Samples | Min | P50 | P90 | P99 | Max | Avg |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    rows,
  ].join("\n")
}

function renderThresholdTable(thresholds) {
  const rows = Object.entries(thresholds)
    .map(
      ([name, values]) =>
        `| ${name} | ${formatMs(values.p90)} | ${formatMs(values.limitMs)} | ${toStatusEmoji(values.ok)} |`,
    )
    .join("\n")

  return [
    "| Metric | P90 | Limit | Status |",
    "| --- | ---: | ---: | --- |",
    rows,
  ].join("\n")
}

function renderRunsTable(runs) {
  const rows = runs
    .map(
      (run) =>
        `| ${run.iteration} | ${shortId(run.sessionId)} | ${formatMs(run.metrics.asrMs)} | ${formatMs(run.metrics.llmFirstTokenMs)} | ${formatMs(run.metrics.ttsFirstChunkMs)} | ${formatMs(run.metrics.ttsDoneMs)} | ${formatMs(run.metrics.analysisMs)} | ${run.errors.length ? "FAIL" : "PASS"} |`,
    )
    .join("\n")

  return [
    "| Run | Session | ASR | LLM first token | TTS first chunk | TTS done | Analysis | Status |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
    rows,
  ].join("\n")
}

function renderErrors(runs) {
  const failed = runs.filter((run) => run.errors.length)
  if (!failed.length) {
    return "None."
  }

  return failed
    .map((run) => {
      const items = run.errors.map((error) => `- \`${error.code}\`: ${error.message}`).join("\n")
      return `### Run ${run.iteration} (${shortId(run.sessionId)})\n${items}`
    })
    .join("\n\n")
}

async function run() {
  const args = parseArgs(process.argv.slice(2))
  const inputPath = getStringArg(args, "input", "")
  if (!inputPath) {
    throw new Error("missing_input: pass --input <latency-json>")
  }

  const absoluteInputPath = path.isAbsolute(inputPath) ? inputPath : path.resolve(process.cwd(), inputPath)
  const raw = await fs.readFile(absoluteInputPath, "utf8")
  const payload = JSON.parse(raw.replace(/^\uFEFF/, ""))
  const outputPath = resolveOutputPath(
    getStringArg(args, "output", ""),
    `${path.basename(absoluteInputPath, path.extname(absoluteInputPath))}.md`,
  )

  const content = [
    "# Voice Coach Latency Report",
    "",
    `Generated: ${payload.generatedAt}`,
    `Source: \`${absoluteInputPath}\``,
    "",
    "## Config",
    "",
    `- Runs: ${payload.config?.runs ?? "-"}`,
    `- WS URL: ${payload.config?.wsBaseUrl ?? "-"}`,
    `- App URL: ${payload.config?.appBaseUrl ?? "-"}`,
    `- Scenario: ${payload.config?.scenarioId ?? "-"}`,
    `- Audio source: ${payload.config?.audioSource?.label ?? "-"}`,
    `- Audio bytes: ${payload.config?.audioSource?.bytes ?? "-"}`,
    `- Simulated stream: ${formatMs(payload.config?.streamMs ?? null)}`,
    "",
    "## Thresholds",
    "",
    renderThresholdTable(payload.thresholds || {}),
    "",
    "## Summary",
    "",
    renderMetricTable(payload.summary || {}),
    "",
    "## Runs",
    "",
    renderRunsTable(payload.runs || []),
    "",
    "## Errors",
    "",
    renderErrors(payload.runs || []),
    "",
  ].join("\n")

  await writeTextFile(outputPath, content)
  console.log(`Markdown report: ${outputPath}`)
}

await run()
