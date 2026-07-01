/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")

function routeSource(...parts) {
  return read("app", "api", "app", "learning", "progress", ...parts)
}

test("APP learning progress GET route is auth protected and tenant scoped", () => {
  const source = routeSource("route.ts")

  assert.match(source, /export const runtime = "nodejs"/)
  assert.match(source, /export async function GET\(request: NextRequest\)/)
  assert.match(source, /resolveAliyunRdsAppAuthUser\(request\)/)
  assert.match(source, /appAuthRequiredResponse\(\)/)
  assert.match(source, /getAliyunRdsAppAccountContext\(auth\.user\)/)
  assert.match(source, /resolveLearningProgressTenantScope\(ctx, params\.get\("context_store_id"\)\)/)
  assert.match(source, /parseLearningProgressModules\(params\.get\("modules"\)\)/)
  assert.match(source, /listLearningProgress/)
  assert.match(source, /company_id: scope\.scope\.companyId/)
  assert.match(source, /store_id: scope\.scope\.storeId/)
  assert.match(source, /membership_id: scope\.scope\.membershipId/)
  assert.match(source, /repository_mode/)
  assert.doesNotMatch(source, /queryAliyunRds/)
  assert.doesNotMatch(source, /withAliyunRdsTransaction/)
})

test("APP learning progress event route ignores untrusted body tenant and supports idempotency", () => {
  const source = routeSource("events", "route.ts")
  const repository = read("lib", "aliyun-rds", "repositories", "learning-progress.server.ts")

  assert.match(source, /export async function POST\(request: NextRequest\)/)
  assert.match(source, /resolveAliyunRdsAppAuthUser\(request\)/)
  assert.match(source, /appAuthRequiredResponse\(\)/)
  assert.match(source, /getAliyunRdsAppAccountContext\(auth\.user\)/)
  assert.match(source, /payload\.context_store_id/)
  assert.match(source, /resolveLearningProgressTenantScope\(ctx, contextStoreId\)/)
  assert.match(source, /applyLearningProgressEvent\(scope\.scope, payload\)/)
  assert.doesNotMatch(source, /payload\.(company_id|store_id|user_id|membership_id)/)

  assert.match(repository, /client_event_id/)
  assert.match(repository, /eventsByClientKey/)
  assert.match(repository, /deduped: true/)
  assert.match(repository, /deduped: false/)
  assert.match(repository, /server_event_id/)
  assert.match(repository, /viewCount \+= 1/)
  assert.match(repository, /practiceCount \+= 1/)
  assert.match(repository, /tenantMemoryKey\(scope\)/)
  assert.match(repository, /scope\.companyId/)
  assert.match(repository, /scope\.storeId/)
  assert.match(repository, /scope\.membershipId/)
  assert.match(repository, /scope\.userId/)
})

test("APP learning progress sync route returns accepted and rejected event contract", () => {
  const source = routeSource("sync", "route.ts")
  const repository = read("lib", "aliyun-rds", "repositories", "learning-progress.server.ts")

  assert.match(source, /export async function POST\(request: NextRequest\)/)
  assert.match(source, /resolveAliyunRdsAppAuthUser\(request\)/)
  assert.match(source, /appAuthRequiredResponse\(\)/)
  assert.match(source, /resolveLearningProgressTenantScope\(ctx, contextStoreId\)/)
  assert.match(source, /syncLearningProgressEvents\(scope\.scope, payload\)/)
  assert.match(source, /accepted_event_ids: result\.accepted_event_ids/)
  assert.match(source, /rejected_events: result\.rejected_events/)
  assert.match(source, /progress: result\.progress/)
  assert.doesNotMatch(source, /payload\.(company_id|store_id|user_id|membership_id)/)

  assert.match(repository, /accepted_event_ids/)
  assert.match(repository, /rejected_events/)
  assert.match(repository, /learning_entity_not_found/)
  assert.match(repository, /invalid_learning_event/)
  assert.match(repository, /client_sync_id/)
})

test("APP learning progress repository seam keeps roles, catalog, and safe facade boundaries explicit", () => {
  const repository = read("lib", "aliyun-rds", "repositories", "learning-progress.server.ts")

  assert.match(repository, /LEARNING_PROGRESS_REPOSITORY_MODE = "facade_in_memory"/)
  assert.match(repository, /__meiyeLearningProgressMemoryStore/)
  assert.match(repository, /role === "customer"/)
  assert.match(repository, /role_denied/)
  assert.match(repository, /not_bound/)
  assert.match(repository, /tenant_forbidden/)
  assert.match(repository, /DEFAULT_PROFESSIONAL_LESSON_ID = "skin-system-s00-01"/)
  assert.match(repository, /DEFAULT_SPEECH_CARD_ID = "A01"/)
  assert.match(repository, /LEARNING_PROGRESS_TOTALS/)
  assert.match(repository, /professional: 89/)
  assert.match(repository, /speech: 30/)
  assert.match(repository, /numberedIds\("A", 1, 10\)/)
  assert.match(repository, /numberedIds\("B", 11, 10\)/)
  assert.match(repository, /numberedIds\("C", 17, 10\)/)
  assert.match(repository, /sync_state: "server"/)
  assert.doesNotMatch(repository, /insert into public\./)
  assert.doesNotMatch(repository, /update public\./)
  assert.doesNotMatch(repository, /delete from public\./)
  assert.doesNotMatch(repository, /queryAliyunRds/)
  assert.doesNotMatch(repository, /withAliyunRdsTransaction/)
})

test("APP learning progress routes are included in route, coverage, and client contract gates", () => {
  const routes = read("scripts", "check-app-api-production-cn-routes.mjs")
  const coverage = read("scripts", "check-app-api-smoke-coverage.mjs")
  const contract = read("scripts", "check-app-client-api-contract.mjs")

  assert.match(routes, /scope:\s*"learning-progress"/)
  assert.match(routes, /route:\s*"\/api\/app\/learning\/progress"/)
  assert.match(routes, /file:\s*"app\/api\/app\/learning\/progress\/route\.ts"/)
  assert.match(routes, /route:\s*"\/api\/app\/learning\/progress\/events"/)
  assert.match(routes, /file:\s*"app\/api\/app\/learning\/progress\/events\/route\.ts"/)
  assert.match(routes, /route:\s*"\/api\/app\/learning\/progress\/sync"/)
  assert.match(routes, /file:\s*"app\/api\/app\/learning\/progress\/sync\/route\.ts"/)

  assert.match(coverage, /path:\s*"\/api\/app\/learning\/progress"/)
  assert.match(coverage, /path:\s*"\/api\/app\/learning\/progress\/events"/)
  assert.match(coverage, /path:\s*"\/api\/app\/learning\/progress\/sync"/)
  assert.match(coverage, /expected:\s*\[\{\s*status:\s*401\s*\}\]/)

  assert.match(contract, /"\/api\/app\/learning\/progress"/)
  assert.match(contract, /const DEFERRED_PREFIXES = \[\]/)
  assert.doesNotMatch(contract, /prefix:\s*"\/api\/app\/learning\/progress"/)
})
