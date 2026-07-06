const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const assertFileExists = (...parts) => {
  const filePath = path.join(root, ...parts)
  assert.equal(fs.existsSync(filePath), true, `${parts.join("/")} must exist`)
  return fs.readFileSync(filePath, "utf8")
}

const ROUTES = [
  {
    file: ["app", "api", "app", "account", "deletion-requests", "route.ts"],
    kind: "account_deletion",
    path: "/api/app/account/deletion-requests",
  },
  {
    file: ["app", "api", "app", "account", "data-deletion-requests", "route.ts"],
    kind: "personal_data_deletion",
    path: "/api/app/account/data-deletion-requests",
  },
]

test("APP account compliance routes exist and require App auth", () => {
  const repository = assertFileExists("lib", "aliyun-rds", "repositories", "app-compliance-requests.server.ts")

  for (const routeSpec of ROUTES) {
    const route = assertFileExists(...routeSpec.file)
    assert.match(route, /export const runtime = "nodejs"/)
    assert.match(route, /export async function POST\(request: NextRequest\)/)
    assert.doesNotMatch(route, /export async function GET\(/)
    assert.match(route, /resolveAliyunRdsAppAuthUser\(request\)/)
    assert.match(route, /appAuthRequiredResponse\(\)/)
    assert.match(route, /appAuthConfigurationErrorResponse\(error\)/)
    assert.match(route, /createAliyunRdsAppComplianceRequest\(/)
    assert.match(route, new RegExp(`kind:\\s*"${routeSpec.kind}"`))
    assert.match(route, /jsonError\(\s*503/)
    assert.match(route, /account_compliance_requests_schema_not_ready/)
  }

  assert.match(repository, /queryAliyunRds/)
  assert.match(repository, /public\.app_compliance_requests/)
  assert.doesNotMatch(repository, /app_account_compliance_requests/)
})

test("APP account compliance routes return request receipts without destructive deletion", () => {
  const repository = read("lib", "aliyun-rds", "repositories", "app-compliance-requests.server.ts")
  const combinedSource = [
    repository,
    ...ROUTES.map(routeSpec => read(...routeSpec.file)),
  ].join("\n")

  assert.match(repository, /type AppComplianceRequestKind = "account_deletion" \| "personal_data_deletion"/)
  assert.match(repository, /insert into public\.app_compliance_requests/)
  assert.doesNotMatch(repository, /app_account_compliance_requests/)
  assert.match(repository, /company_id, store_id, membership_id, user_id, kind, status, reason/)
  assert.match(repository, /values \(\$1, \$2, \$3, \$4, \$5, 'received', \$6/)
  assert.match(repository, /returning id, kind, status, requested_at/)
  assert.match(repository, /expected_completion:\s*EXPECTED_COMPLETION/)
  assert.match(repository, /contact_channel:\s*CONTACT_CHANNEL/)
  assert.match(repository, /function toPublicComplianceRequest/)
  assert.match(repository, /accountComplianceRequestSchemaMissing/)

  for (const routeSpec of ROUTES) {
    assert.match(combinedSource, new RegExp(routeSpec.path.replace(/\//g, "\\/")))
    assert.match(combinedSource, new RegExp(`kind:\\s*"${routeSpec.kind}"`))
  }

  assert.doesNotMatch(
    combinedSource,
    /delete\s+from|truncate\s+table|drop\s+table|drop\s+schema|alter\s+table\s+.*drop|anonymi[sz]e|removeUser|deleteUser|auth\.admin\.deleteUser|storage\.from\([^)]*\)\.remove|oss.*delete|deleteObject/i,
  )
  assert.doesNotMatch(combinedSource, /raw_token|plain_token|authorization|Bearer|console\.(log|error|warn)/i)
})
