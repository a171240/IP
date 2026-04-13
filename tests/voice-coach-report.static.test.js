const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")

const endRouteSource = read("app", "api", "voice-coach", "sessions", "[sessionId]", "end", "route.ts")
const reportRouteSource = read("app", "api", "voice-coach", "sessions", "[sessionId]", "report", "route.ts")
const jobsSource = read("lib", "voice-coach", "jobs.server.ts")
const llmSource = read("lib", "voice-coach", "llm.server.ts")
const refreshSource = read("lib", "voice-coach", "report-refresh.ts")
const reportServerSource = read("lib", "voice-coach", "report.server.ts")
const reportWxmlSource = read("mini-program-ui", "pages", "voice-coach", "report.wxml")
const sessionRouteSource = read("app", "api", "voice-coach", "sessions", "route.ts")

test("view_report and GET /report both use the shared report refresh service", () => {
  assert.match(endRouteSource, /import \{ refreshVoiceCoachReport \} from "@\/lib\/voice-coach\/report-refresh"/)
  assert.match(reportRouteSource, /import \{ refreshVoiceCoachReport \} from "@\/lib\/voice-coach\/report-refresh"/)
  assert.match(endRouteSource, /if \(mode === "end_only"\)/)
  assert.match(endRouteSource, /return NextResponse\.json\(\{ ok: true \}\)/)
  assert.match(endRouteSource, /const \{ report \} = await refreshVoiceCoachReport\(\{/)
  assert.match(reportRouteSource, /const \{ report \} = await refreshVoiceCoachReport\(\{/)
  assert.match(refreshSource, /maxWaitMs = 2500/)
  assert.match(refreshSource, /countPendingAnalysisJobs/)
  assert.match(refreshSource, /pumpAnalysisJobs/)
  assert.match(refreshSource, /const report = generateVoiceCoachReport\(\{ scenario, turns \}\)/)
  assert.match(refreshSource, /await ops\.saveReport\(\{/)
})

test("report generation now carries meta, representative turn logic and ordered organization examples", () => {
  assert.match(reportServerSource, /representative_turn_id/)
  assert.match(reportServerSource, /organization_example_turn_ids/)
  assert.match(reportServerSource, /pickRepresentativeTurn/)
  assert.match(reportServerSource, /pickOrganizationExamples/)
  assert.match(reportServerSource, /summary_blocks: summaryBlocks/)
  assert.match(reportServerSource, /is_complete:/)
})

test("report-related schema contracts are tightened and customer tags are normalized before storage", () => {
  assert.match(llmSource, /polished: z\.string\(\)\.min\(40\)\.max\(220\)/)
  assert.match(jobsSource, /const normalizedNextCustomerTag = normalizeScenarioTag\(nextCustomer\.tag, scenario\)/)
  assert.match(jobsSource, /features_json: \{ tag: normalizedNextCustomerTag \}/)
  assert.match(sessionRouteSource, /features_json: \{ tag: normalizeScenarioTag\(first\.tag, scenario\) \}/)
})

test("report page copy reflects the new coaching review flow without changing structure", () => {
  assert.ok(reportWxmlSource.includes("本场关键异议复盘"))
  assert.ok(reportWxmlSource.includes("优先回听片段"))
  assert.ok(reportWxmlSource.includes("报告基于当前已完成分析生成"))
  assert.ok(reportWxmlSource.includes("训练完成 · 评测档案"))
})
