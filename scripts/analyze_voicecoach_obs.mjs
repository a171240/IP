import fs from "node:fs"
import path from "node:path"

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const item = String(argv[i] || "")
    if (!item.startsWith("--")) continue
    const key = item.slice(2)
    const next = argv[i + 1]
    if (next && !String(next).startsWith("--")) {
      args[key] = String(next)
      i += 1
      continue
    }
    args[key] = "true"
  }
  return args
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) return null
  const sorted = values.slice().sort((a, b) => a - b)
  if (sorted.length === 1) return sorted[0]
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  const ratio = idx - lo
  return sorted[lo] + (sorted[hi] - sorted[lo]) * ratio
}

function roundInt(value) {
  const n = toNumber(value)
  return n === null ? null : Math.round(n)
}

function countBy(items) {
  const out = {}
  for (const item of items) {
    const key = String(item || "").trim()
    if (!key) continue
    out[key] = (out[key] || 0) + 1
  }
  return out
}

function flattenEvents(bench) {
  const events = []
  const rounds = Array.isArray(bench?.rounds) ? bench.rounds : []
  for (const round of rounds) {
    const batch = Array.isArray(round?.events) ? round.events : []
    for (const ev of batch) events.push(ev)
  }
  return events
}

function eventHasAuditFields(ev) {
  return Boolean(
    String(ev?.trace_id || "").trim() &&
      String(ev?.client_build || "").trim() &&
      String(ev?.server_build || "").trim() &&
      String(ev?.executor || "").trim(),
  )
}

function stageStats(values) {
  const nums = values.map((item) => toNumber(item)).filter((item) => item !== null)
  return {
    count: nums.length,
    p50: roundInt(percentile(nums, 50)),
    p95: roundInt(percentile(nums, 95)),
  }
}

function requiredStageStatsPresent(stageMetrics) {
  const keys = [
    "submit_ack_ms",
    "asr_ready_ms",
    "text_ready_ms",
    "audio_ready_ms",
    "queue_wait_before_main_ms",
    "queue_wait_before_tts_ms",
  ]
  return keys.every((key) => {
    const metric = stageMetrics[key]
    return metric && metric.p50 !== null && metric.p95 !== null
  })
}

function summarizeGroup(label, bench, opts) {
  const rounds = Array.isArray(bench?.rounds) ? bench.rounds : []
  const events = flattenEvents(bench)
  const asrReady = events.filter((ev) => ev?.type === "beautician.asr_ready")
  const textReady = events.filter((ev) => ev?.type === "customer.text_ready")
  const audioReady = events.filter((ev) => ev?.type === "customer.audio_ready")
  const errors = events.filter((ev) => ev?.type === "turn.error")

  const executorDistribution = countBy(events.map((ev) => ev?.executor || ""))
  const executorTotal = Object.values(executorDistribution).reduce((sum, n) => sum + Number(n || 0), 0)
  const workerCount = Number(executorDistribution.worker || 0)

  const asrAttempted = []
  for (const ev of asrReady) {
    const attempted = Array.isArray(ev?.asr_provider_attempted) ? ev.asr_provider_attempted : []
    for (const provider of attempted) asrAttempted.push(provider)
  }
  const asrProviderAttempted = countBy(asrAttempted)
  const asrProviderFinal = countBy(asrReady.map((ev) => ev?.asr_provider_final || ""))
  const asrFinalTotal = Object.values(asrProviderFinal).reduce((sum, n) => sum + Number(n || 0), 0)
  const asrFlashRatio = asrFinalTotal > 0 ? Number(((asrProviderFinal.flash || 0) / asrFinalTotal).toFixed(4)) : null

  const queueWaitBeforeTtsValid = audioReady
    .filter((ev) => ev?.queue_wait_before_tts_valid === true)
    .map((ev) => ev?.queue_wait_before_tts_ms)
  const queueWaitBeforeTtsInvalid = audioReady.filter((ev) => ev?.queue_wait_before_tts_valid !== true).length
  const queueWaitBeforeTtsInvalidRate =
    audioReady.length > 0 ? Number((queueWaitBeforeTtsInvalid / audioReady.length).toFixed(4)) : null

  const ttsCacheHitValues = audioReady
    .map((ev) => (typeof ev?.tts_cache_hit === "boolean" ? ev.tts_cache_hit : null))
    .filter((item) => item !== null)
  const ttsCacheHitRate =
    ttsCacheHitValues.length > 0
      ? Number((ttsCacheHitValues.filter(Boolean).length / ttsCacheHitValues.length).toFixed(4))
      : null

  const stageMetrics = {
    submit_ack_ms: stageStats(rounds.map((round) => round?.submitElapsedMs)),
    asr_ready_ms: stageStats(asrReady.map((ev) => ev?.stage_elapsed_ms)),
    text_ready_ms: stageStats(textReady.map((ev) => ev?.stage_elapsed_ms)),
    audio_ready_ms: stageStats(audioReady.map((ev) => ev?.stage_elapsed_ms)),
    queue_wait_before_main_ms: stageStats(asrReady.map((ev) => ev?.queue_wait_before_main_ms)),
    queue_wait_before_tts_ms: stageStats(queueWaitBeforeTtsValid),
    llm_ms: stageStats(textReady.map((ev) => ev?.llm_ms)),
    tts_ms: stageStats(audioReady.map((ev) => ev?.tts_ms)),
  }

  const sampleEvents = events
    .filter((ev) => eventHasAuditFields(ev))
    .slice(0, 2)
    .map((ev) => ({
      trace_id: ev.trace_id,
      client_build: ev.client_build,
      server_build: ev.server_build,
      executor: ev.executor,
      type: ev.type,
      flash_logid: ev.flash_logid ?? null,
    }))

  const missingRequiredCount = events.filter((ev) => !eventHasAuditFields(ev)).length
  const audioReadyCount = audioReady.length
  const asrReadyCount = asrReady.length
  const expectedRounds = rounds.length

  const usable = audioReadyCount >= expectedRounds && errors.length === 0
  const requireFlashPass =
    opts.requireFlash === true
      ? usable && asrReadyCount >= expectedRounds && Object.keys(asrProviderFinal).every((k) => k === "flash")
      : true

  return {
    group: label,
    require_flash: Boolean(opts.requireFlash),
    path_mode: opts.pathMode,
    bench_label: String(bench?.benchLabel || bench?.bench_label || label),
    client_build: String(bench?.client_build || bench?.clientBuild || ""),
    server_build: String(bench?.server_build || ""),
    rounds: expectedRounds,
    sample_events: events.length,
    missing_required_count: missingRequiredCount,
    executor_distribution: executorDistribution,
    executor_worker_ratio: executorTotal > 0 ? Number((workerCount / executorTotal).toFixed(4)) : null,
    submit_pump_count: Number(executorDistribution.submit_pump || 0),
    events_pump_count: Number(executorDistribution.events_pump || 0),
    asr_provider_attempted: asrProviderAttempted,
    asr_provider_final: asrProviderFinal,
    asr_provider_final_flash_ratio: asrFlashRatio,
    queue_wait_before_tts_invalid_rate: queueWaitBeforeTtsInvalidRate,
    tts_cache_hit_rate: ttsCacheHitRate,
    stage_metrics: stageMetrics,
    counts: {
      asr_ready: asrReadyCount,
      text_ready: textReady.length,
      audio_ready: audioReadyCount,
      turn_error: errors.length,
    },
    usable,
    require_flash_pass: requireFlashPass,
    stage_metrics_complete: requiredStageStatsPresent(stageMetrics),
    audit_samples: sampleEvents,
  }
}

function sumCounts(groups, key) {
  return groups.reduce((sum, group) => sum + Number(group?.[key] || 0), 0)
}

function aggregateStageMetric(groups, key) {
  const p50Values = groups.map((group) => toNumber(group?.stage_metrics?.[key]?.p50)).filter((n) => n !== null)
  const p95Values = groups.map((group) => toNumber(group?.stage_metrics?.[key]?.p95)).filter((n) => n !== null)
  return {
    p50: p50Values.length ? roundInt(percentile(p50Values, 50)) : null,
    p95: p95Values.length ? roundInt(Math.max(...p95Values)) : null,
  }
}

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"))
}

const args = parseArgs(process.argv.slice(2))

const benchAPath = String(args.a || "").trim()
const benchBPath = String(args.b || "").trim()
const benchCPath = String(args.c || "").trim()
const outJsonPath = String(args.out || "").trim()
const outMdPath = String(args.md || "").trim()

if (!benchAPath || !benchBPath || !benchCPath || !outJsonPath || !outMdPath) {
  console.error(
    "Usage: node scripts/analyze_voicecoach_obs.mjs --a <bench_A.json> --b <bench_B.json> --c <bench_C.json> --out <analysis.json> --md <analysis.md>",
  )
  process.exit(1)
}

const benchA = loadJson(benchAPath)
const benchB = loadJson(benchBPath)
const benchC = loadJson(benchCPath)

const groupA = summarizeGroup("A", benchA, { requireFlash: true, pathMode: "flash_required" })
const groupB = summarizeGroup("B", benchB, { requireFlash: true, pathMode: "flash_primary" })
const groupC = summarizeGroup("C", benchC, { requireFlash: false, pathMode: "slow_path_degraded" })

const groups = [groupA, groupB, groupC]

const missingRequiredCountTotal = sumCounts(groups, "missing_required_count")
const submitPumpCount = sumCounts(groups, "submit_pump_count")
const eventsPumpCount = sumCounts(groups, "events_pump_count")

const totalEvents = groups.reduce((sum, group) => {
  const dist = group?.executor_distribution || {}
  return sum + Object.values(dist).reduce((acc, n) => acc + Number(n || 0), 0)
}, 0)
const totalWorker = groups.reduce((sum, group) => sum + Number(group?.executor_distribution?.worker || 0), 0)
const executorWorkerRatio = totalEvents > 0 ? Number((totalWorker / totalEvents).toFixed(4)) : null

const stageMetricsOverall = {
  submit_ack_ms: aggregateStageMetric(groups, "submit_ack_ms"),
  asr_ready_ms: aggregateStageMetric(groups, "asr_ready_ms"),
  text_ready_ms: aggregateStageMetric(groups, "text_ready_ms"),
  audio_ready_ms: aggregateStageMetric(groups, "audio_ready_ms"),
  queue_wait_before_main_ms: aggregateStageMetric(groups, "queue_wait_before_main_ms"),
  queue_wait_before_tts_ms: aggregateStageMetric(groups, "queue_wait_before_tts_ms"),
  llm_ms: aggregateStageMetric(groups, "llm_ms"),
  tts_ms: aggregateStageMetric(groups, "tts_ms"),
}

const ttsCacheRates = groups.map((group) => toNumber(group?.tts_cache_hit_rate)).filter((n) => n !== null)
const ttsCacheHitRate =
  ttsCacheRates.length > 0
    ? Number((ttsCacheRates.reduce((sum, n) => sum + n, 0) / ttsCacheRates.length).toFixed(4))
    : null

const asrProviderFinalFlashRatio = toNumber(groupB.asr_provider_final_flash_ratio)

const queueWaitBeforeTtsInvalidRates = groups
  .map((group) => toNumber(group?.queue_wait_before_tts_invalid_rate))
  .filter((n) => n !== null)
const queueWaitBeforeTtsInvalidRate =
  queueWaitBeforeTtsInvalidRates.length > 0
    ? Number((queueWaitBeforeTtsInvalidRates.reduce((sum, n) => sum + n, 0) / queueWaitBeforeTtsInvalidRates.length).toFixed(4))
    : null

const g0Pass = missingRequiredCountTotal === 0 && submitPumpCount === 0
const g1Pass = toNumber(groupB?.stage_metrics?.audio_ready_ms?.p50) !== null && Number(groupB.stage_metrics.audio_ready_ms.p50) <= 8000
const g2Pass = groups.every((group) => group.stage_metrics_complete)
const g3Pass = groupA.require_flash_pass && groupC.usable && groupC.path_mode === "slow_path_degraded"

const analysis = {
  generated_at: new Date().toISOString(),
  work_order: "WO-R4-OBS/window2",
  inputs: {
    bench_A: path.resolve(benchAPath),
    bench_B: path.resolve(benchBPath),
    bench_C: path.resolve(benchCPath),
  },
  groups: {
    A: groupA,
    B: groupB,
    C: groupC,
  },
  summary: {
    missing_required_count_total: missingRequiredCountTotal,
    submit_pump_count: submitPumpCount,
    events_pump_count: eventsPumpCount,
    executor_worker_ratio: executorWorkerRatio,
    asr_provider_final_flash_ratio: asrProviderFinalFlashRatio,
    queue_wait_before_tts_invalid_rate: queueWaitBeforeTtsInvalidRate,
    stage_metrics: stageMetricsOverall,
    b_audio_ready_p50_target_ms: 8000,
    b_audio_ready_p50_actual_ms: toNumber(groupB?.stage_metrics?.audio_ready_ms?.p50),
  },
  gates: {
    G0: `${g0Pass ? "PASS" : "FAIL"}: missing_required_count_total=${missingRequiredCountTotal}, submit_pump_count=${submitPumpCount}`,
    G1: `${g1Pass ? "PASS" : "FAIL"}: audio_ready_ms_B_p50=${groupB?.stage_metrics?.audio_ready_ms?.p50} target<=8000`,
    G2: `${g2Pass ? "PASS" : "FAIL"}: stage_metric_fields_complete=${g2Pass}`,
    G3: `${g3Pass ? "PASS" : "FAIL"}: A_require_flash_pass=${groupA.require_flash_pass}, C_usable=${groupC.usable}, C_path_mode=${groupC.path_mode}`,
  },
  metrics: {
    asr_provider_A: groupA.asr_provider_final,
    asr_provider_B: groupB.asr_provider_final,
    asr_provider_C: groupC.asr_provider_final,
    audio_ready_ms_B_p50: groupB?.stage_metrics?.audio_ready_ms?.p50,
    audio_ready_ms_B_p95: groupB?.stage_metrics?.audio_ready_ms?.p95,
    audio_ready_ms_C_p50: groupC?.stage_metrics?.audio_ready_ms?.p50,
    audio_ready_ms_C_p95: groupC?.stage_metrics?.audio_ready_ms?.p95,
    llm_ms_p50: stageMetricsOverall.llm_ms.p50,
    llm_ms_p95: stageMetricsOverall.llm_ms.p95,
    tts_ms_p50: stageMetricsOverall.tts_ms.p50,
    tts_ms_p95: stageMetricsOverall.tts_ms.p95,
    queue_wait_before_main_ms_p50: stageMetricsOverall.queue_wait_before_main_ms.p50,
    queue_wait_before_main_ms_p95: stageMetricsOverall.queue_wait_before_main_ms.p95,
    queue_wait_before_tts_ms_p50: stageMetricsOverall.queue_wait_before_tts_ms.p50,
    queue_wait_before_tts_ms_p95: stageMetricsOverall.queue_wait_before_tts_ms.p95,
    tts_cache_hit_rate: ttsCacheHitRate,
    executor_worker_ratio: executorWorkerRatio,
    submit_pump_count: submitPumpCount,
    events_pump_count: eventsPumpCount,
    asr_provider_final_flash_ratio: asrProviderFinalFlashRatio,
    queue_wait_before_tts_invalid_rate: queueWaitBeforeTtsInvalidRate,
    submit_ack_ms_p50: stageMetricsOverall.submit_ack_ms.p50,
    submit_ack_ms_p95: stageMetricsOverall.submit_ack_ms.p95,
    asr_ready_ms_p50: stageMetricsOverall.asr_ready_ms.p50,
    asr_ready_ms_p95: stageMetricsOverall.asr_ready_ms.p95,
    text_ready_ms_p50: stageMetricsOverall.text_ready_ms.p50,
    text_ready_ms_p95: stageMetricsOverall.text_ready_ms.p95,
    audio_ready_ms_p50: stageMetricsOverall.audio_ready_ms.p50,
    audio_ready_ms_p95: stageMetricsOverall.audio_ready_ms.p95,
  },
}

const md = [
  "# WO-R4-OBS Window2 Analysis",
  "",
  "## Scope",
  "- Metrics-calibration and audit rollup only (`scripts/*`, `docs/runbooks/*`).",
  "",
  "## Inputs",
  `- bench_A: \`${analysis.inputs.bench_A}\``,
  `- bench_B: \`${analysis.inputs.bench_B}\``,
  `- bench_C: \`${analysis.inputs.bench_C}\``,
  "",
  "## Stage Metrics (P50/P95, overall)",
  `- submit_ack_ms: ${analysis.summary.stage_metrics.submit_ack_ms.p50}/${analysis.summary.stage_metrics.submit_ack_ms.p95}`,
  `- asr_ready_ms: ${analysis.summary.stage_metrics.asr_ready_ms.p50}/${analysis.summary.stage_metrics.asr_ready_ms.p95}`,
  `- text_ready_ms: ${analysis.summary.stage_metrics.text_ready_ms.p50}/${analysis.summary.stage_metrics.text_ready_ms.p95}`,
  `- audio_ready_ms: ${analysis.summary.stage_metrics.audio_ready_ms.p50}/${analysis.summary.stage_metrics.audio_ready_ms.p95}`,
  `- queue_wait_before_main_ms: ${analysis.summary.stage_metrics.queue_wait_before_main_ms.p50}/${analysis.summary.stage_metrics.queue_wait_before_main_ms.p95}`,
  `- queue_wait_before_tts_ms(valid-only): ${analysis.summary.stage_metrics.queue_wait_before_tts_ms.p50}/${analysis.summary.stage_metrics.queue_wait_before_tts_ms.p95}`,
  "",
  "## Group Notes",
  `- A: require_flash=true, pass=${groupA.require_flash_pass}`,
  `- B: flash_primary, audio_ready_ms_p50=${groupB.stage_metrics.audio_ready_ms.p50}`,
  `- C: ${groupC.path_mode}, usable=${groupC.usable}`,
  "",
  "## Gates",
  `- G0: ${analysis.gates.G0}`,
  `- G1: ${analysis.gates.G1}`,
  `- G2: ${analysis.gates.G2}`,
  `- G3: ${analysis.gates.G3}`,
  "",
].join("\n")

fs.mkdirSync(path.dirname(outJsonPath), { recursive: true })
fs.writeFileSync(outJsonPath, JSON.stringify(analysis, null, 2))
fs.writeFileSync(outMdPath, md)

console.log(JSON.stringify({ out_json: path.resolve(outJsonPath), out_md: path.resolve(outMdPath), gates: analysis.gates }, null, 2))
