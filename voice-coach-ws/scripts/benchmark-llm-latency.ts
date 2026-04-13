import "dotenv/config"

import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import {
  defaultBenchmarkMessages,
  dedupeTargets,
  discoverDefaultTargets,
  formatMs,
  parseTargetSpec,
  runBenchmarkSuite,
  selectTargets,
  summarizeResults,
  writeJsonReport,
  type BenchmarkMessage,
  type BenchmarkTarget,
} from "./lib/llm-benchmark.js"

type CliOptions = {
  iterations: number
  timeoutMs: number
  temperature: number
  maxTokens?: number
  providers: string[]
  targetSpecs: string[]
  prompt?: string
  system?: string
  messagesFile?: string
  outFile?: string
  help: boolean
}

function printHelp(): void {
  console.log(`Usage: npx tsx scripts/benchmark-llm-latency.ts [options]

Options:
  --iterations <n>       Number of runs per target (default: 3)
  --timeout-ms <n>       Per-request timeout in milliseconds (default: 30000)
  --temperature <n>      Chat completion temperature (default: 0)
  --max-tokens <n>       max_tokens passed to the provider
  --provider <names>     Comma-separated target names to run, e.g. ark,deepseek
  --target <spec>        Extra OpenAI-compatible target:
                         name=myproxy,label=My Proxy,baseUrl=https://host/v1,model=foo,apiKeyEnv=MY_KEY
  --prompt <text>        Override the default user prompt
  --system <text>        Override the default system prompt
  --messages-file <path> JSON file with OpenAI-style chat messages
  --out <path>           Write a JSON report to disk
  --help                 Show this message

Auto-discovered env targets:
  ark       via ARK_API_KEY or DOUBAO_API_KEY
  deepseek  via DEEPSEEK_API_KEY (defaults to DeepSeek V3 / deepseek-chat)
  openai    via OPENAI_API_KEY + OPENAI_MODEL

Exit code:
  0 when every run succeeds
  1 when any run fails or no runnable target is found`)
}

function requireNextValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1]
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`)
  }
  return value
}

function parsePositiveInt(value: string, flag: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer.`)
  }
  return parsed
}

function parseNumber(value: string, flag: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`${flag} must be a number.`)
  }
  return parsed
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    iterations: 3,
    timeoutMs: 30_000,
    temperature: 0,
    providers: [],
    targetSpecs: [],
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    switch (arg) {
      case "--iterations":
        options.iterations = parsePositiveInt(requireNextValue(argv, index, arg), arg)
        index += 1
        break
      case "--timeout-ms":
        options.timeoutMs = parsePositiveInt(requireNextValue(argv, index, arg), arg)
        index += 1
        break
      case "--temperature":
        options.temperature = parseNumber(requireNextValue(argv, index, arg), arg)
        index += 1
        break
      case "--max-tokens":
        options.maxTokens = parsePositiveInt(requireNextValue(argv, index, arg), arg)
        index += 1
        break
      case "--provider":
        options.providers.push(
          ...requireNextValue(argv, index, arg)
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        )
        index += 1
        break
      case "--target":
        options.targetSpecs.push(requireNextValue(argv, index, arg))
        index += 1
        break
      case "--prompt":
        options.prompt = requireNextValue(argv, index, arg)
        index += 1
        break
      case "--system":
        options.system = requireNextValue(argv, index, arg)
        index += 1
        break
      case "--messages-file":
        options.messagesFile = requireNextValue(argv, index, arg)
        index += 1
        break
      case "--out":
        options.outFile = requireNextValue(argv, index, arg)
        index += 1
        break
      case "--help":
      case "-h":
        options.help = true
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

function validateMessages(input: unknown): BenchmarkMessage[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("messages-file must contain a non-empty JSON array.")
  }

  return input.map((message, index) => {
    if (!message || typeof message !== "object") {
      throw new Error(`Message at index ${index} must be an object.`)
    }

    const role = (message as { role?: unknown }).role
    const content = (message as { content?: unknown }).content
    if (
      role !== "system" &&
      role !== "user" &&
      role !== "assistant" &&
      role !== "developer"
    ) {
      throw new Error(`Message at index ${index} has an invalid role.`)
    }
    if (typeof content !== "string" || !content.trim()) {
      throw new Error(`Message at index ${index} must have a non-empty string content.`)
    }

    return {
      role,
      content,
    }
  })
}

async function loadMessages(options: CliOptions): Promise<BenchmarkMessage[]> {
  if (options.messagesFile) {
    const raw = await readFile(resolve(options.messagesFile), "utf8")
    return validateMessages(JSON.parse(raw))
  }

  const systemMessage =
    options.system ??
    defaultBenchmarkMessages.find((message) => message.role === "system")?.content ??
    ""
  const userMessage =
    options.prompt ??
    defaultBenchmarkMessages.find((message) => message.role === "user")?.content ??
    ""

  return [
    { role: "system", content: systemMessage },
    { role: "user", content: userMessage },
  ]
}

function resolveTargets(options: CliOptions): BenchmarkTarget[] {
  const envTargets = discoverDefaultTargets(process.env)
  const cliTargets = options.targetSpecs.map((spec) => parseTargetSpec(spec, process.env))
  const merged = dedupeTargets([...envTargets, ...cliTargets])
  return selectTargets(merged, options.providers)
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }

  const messages = await loadMessages(options)
  const targets = resolveTargets(options)

  if (!targets.length) {
    console.error("No runnable targets found. Set env vars or pass --target.")
    printHelp()
    process.exitCode = 1
    return
  }

  console.log(
    `Running ${options.iterations} iteration(s) across ${targets.length} target(s). timeout=${options.timeoutMs}ms`,
  )
  console.log(`Targets: ${targets.map((target) => `${target.name}(${target.model})`).join(", ")}`)

  const results = await runBenchmarkSuite(targets, {
    iterations: options.iterations,
    timeoutMs: options.timeoutMs,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    messages,
  }, {
    onProgress: ({ result }) => {
      if (result.success) {
        console.log(
          `[${result.targetName}] run ${result.iteration} ok ttft=${formatMs(result.ttftMs)} total=${formatMs(result.totalLatencyMs)} chars=${result.outputChars}`,
        )
        return
      }

      console.log(
        `[${result.targetName}] run ${result.iteration} fail total=${formatMs(result.totalLatencyMs)} error=${truncate(result.error || "unknown_error", 120)}`,
      )
    },
  })

  const summaries = summarizeResults(results)
  console.log("")
  console.table(
    summaries.map((summary) => ({
      target: summary.targetName,
      label: summary.targetLabel,
      model: summary.model,
      ok: summary.successCount,
      fail: summary.failureCount,
      avg_ttft: formatMs(summary.avgTtftMs),
      p95_ttft: formatMs(summary.p95TtftMs),
      avg_total: formatMs(summary.avgTotalLatencyMs),
      p95_total: formatMs(summary.p95TotalLatencyMs),
      avg_chars: Math.round(summary.avgOutputChars),
      first_error: truncate(summary.firstError, 60),
    })),
  )

  if (options.outFile) {
    const reportPath = resolve(options.outFile)
    await writeJsonReport(reportPath, {
      generatedAt: new Date().toISOString(),
      settings: {
        iterations: options.iterations,
        timeoutMs: options.timeoutMs,
        temperature: options.temperature,
        maxTokens: options.maxTokens ?? null,
      },
      targets: targets.map((target) => ({
        name: target.name,
        label: target.label,
        baseUrl: target.baseUrl,
        model: target.model,
        source: target.source,
      })),
      messages,
      results,
      summaries,
    })
    console.log(`JSON report written to ${reportPath}`)
  }

  process.exitCode = results.some((result) => !result.success) ? 1 : 0
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Benchmark failed: ${message}`)
  process.exitCode = 1
})
