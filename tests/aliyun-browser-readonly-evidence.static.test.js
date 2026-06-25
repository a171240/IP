const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))
const secretLike = /(sk-[A-Za-z0-9_-]{20,}|LTAI[A-Za-z0-9]{12,}|:\/\/[^\s:@]+:[^\s@]+@|AccessKeySecret\s*[:=]\s*\S{8,}|AppSecret\s*[:=]\s*\S{8,}|token\s*[:=]\s*\S{8,})/i

test("Aliyun browser read-only evidence records backend-only console findings", () => {
  const pkg = readJson("package.json")
  const doc = read("docs", "app-production-cn-aliyun-browser-readonly-evidence-2026-06-25.md")

  assert.equal(pkg.scripts["aliyun:browser-evidence:test"], "node --test tests/aliyun-browser-readonly-evidence.static.test.js")
  assert.match(doc, /currentScope: backend_aliyun_only/)
  assert.match(doc, /canProceedWithoutWechat: true/)
  assert.match(doc, /canDeployBackendNow: false/)
  assert.match(doc, /cloudApiCalled: false/)
  assert.match(doc, /mutationPerformed: false/)
  assert.match(doc, /purchaseCreatedOrUpdated: false/)
  assert.match(doc, /secretsReadOrWritten: false/)

  assert.match(doc, /observedAt: 2026-06-25T17:57:08\+08:00/)
  assert.match(doc, /mode: Aliyun console visible DOM, read-only navigation/)
  assert.match(doc, /RDS list shows "暂无符合条件的资源"/)
  assert.match(doc, /OSS bucket overview shows "meiye-huajing-service-records-production-cn \/ 华东1（杭州）"/)
  assert.match(doc, /SLS project list shows "meiye-huajing-app-prod-cn"/)
  assert.match(doc, /no visible api-cn\/assets-cn rows/)
  assert.match(doc, /does not close RDS, ACR, SAE runtime, DNS\/HTTPS\/ICP, RAM\/STS, env import, SLS alert, or smoke gates/)

  assert.match(doc, /targetApp: meiye-huajing-app-api-production-cn/)
  assert.match(doc, /targetAppVisible: false/)
  assert.match(doc, /applicationCount: 0/)
  assert.match(doc, /totalInstances: 0\/2200/)

  assert.match(doc, /targetRepository: meiye-huajing-app-api/)
  assert.match(doc, /targetRepositoryVisible: false/)
  assert.match(doc, /targetProductionPostgresConfirmed: false/)
  assert.match(doc, /visibleTargetInstance: false/)
  assert.match(doc, /latestVisibleState: 暂无符合条件的资源/)

  assert.match(doc, /bucket: meiye-huajing-service-records-production-cn/)
  assert.match(doc, /bucketVisible: true/)
  assert.match(doc, /serviceRecordPrefix: service-records\/production-cn/)
  assert.match(doc, /latestVisibleState: meiye-huajing-service-records-production-cn \/ 华东1（杭州）/)

  assert.match(doc, /slsProject: meiye-huajing-app-prod-cn/)
  assert.match(doc, /slsProjectVisible: true/)
  assert.match(doc, /logsearch\/app-api/)
  assert.match(doc, /healthAlertConfigured: false/)
  assert.match(doc, /serverErrorAlertConfigured: false/)
  assert.match(doc, /latestVisibleState: meiye-huajing-app-prod-cn 美业话镜 APP production-cn API logs 华东1（杭州）/)

  assert.match(doc, /domain: ipgongchang\.xin/)
  assert.match(doc, /existingRecords: api A 106\.14\.241\.129; ip A 106\.14\.241\.129/)
  assert.match(doc, /latestVisibleRecords: api A 106\.14\.241\.129; ip A 106\.14\.241\.129; no visible api-cn\/assets-cn rows/)
  assert.match(doc, /apiCnRecordVisible: false/)
  assert.match(doc, /assetsCnRecordVisible: false/)
  assert.match(doc, /formal production-cn APP hosts are not bound/)

  assert.match(doc, /excludedFromThisBackendTarget: WeChat Open Platform mobile app; Android release signing; Apple Team ID; app-store launch work/)
  assert.doesNotMatch(doc, secretLike)
})
