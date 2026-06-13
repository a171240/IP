const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const processingSource = fs.readFileSync(path.join(root, "lib", "service-records", "processing.server.ts"), "utf8")

test("service record v2 prompt includes business intelligence fields", () => {
  assert.match(processingSource, /"sales_opportunities"/)
  assert.match(processingSource, /"missed_sales_signals"/)
  assert.match(processingSource, /"manager_brief"/)
  assert.match(processingSource, /"customer_profile_update_suggestions"/)
  assert.match(processingSource, /销售机会必须基于转写证据或顾客档案上下文/)
  assert.match(processingSource, /表示待确认建议，不能写成已更新事实/)
})

test("service record v2 normalization preserves additive fields and v1 fallback", () => {
  assert.match(processingSource, /function normalizeSalesOpportunity/)
  assert.match(processingSource, /function normalizeManagerBrief/)
  assert.match(processingSource, /function normalizeProfileUpdateSuggestions/)
  assert.match(processingSource, /sales_opportunities: listRecordFrom\(root\.sales_opportunities/)
  assert.match(processingSource, /missed_sales_signals: listFrom\(staffReview\.missed_sales_signals/)
  assert.match(processingSource, /customer_profile_suggestions: listFrom\(/)
  assert.match(processingSource, /service_minutes_v2: serviceMinutesV2/)
  assert.match(processingSource, /employee_feedback: employeeFeedback/)
  assert.match(processingSource, /manager_review: managerReview/)
  assert.match(processingSource, /operations,/)
})
