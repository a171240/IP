const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()

function read(...parts) {
  return fs.readFileSync(path.join(root, ...parts), "utf8")
}

test("Aliyun RDS request context helper sets app.current_user_id through a bound transaction parameter", () => {
  const source = read("lib", "aliyun-rds", "postgres.server.ts")

  assert.match(source, /export async function withAliyunRdsRequestContext/)
  assert.match(source, /withAliyunRdsTransaction\(async \(client\) =>/)
  assert.match(source, /set_config\('app\.current_user_id', \$1, true\)/)
  assert.match(source, /\[normalizedUserId\]/)
  assert.doesNotMatch(source, /set_config\('app\.current_user_id'[\s\S]*\$\{/)
  assert.match(source, /function normalizeRdsRequestUserId/)
  assert.match(source, /A valid APP user UUID is required for Aliyun RDS request context/)
})

test("Aliyun RDS pool can resolve DATABASE_URL_CN from KMS through runtime OIDC without plain env import", () => {
  const postgresSource = read("lib", "aliyun-rds", "postgres.server.ts")
  const kmsSource = read("lib", "aliyun-rds", "kms-secret.server.ts")

  assert.match(postgresSource, /getAliyunKmsDatabaseUrlSecretValue/)
  assert.match(postgresSource, /isAliyunKmsSecretDatabaseUrlConfigured/)
  assert.match(postgresSource, /export async function getAliyunRdsPool/)
  assert.match(postgresSource, /connectionString: await resolveDatabaseUrl\(\)/)
  assert.match(postgresSource, /globalThis\.__meiyeAliyunRdsPoolInit/)
  assert.match(postgresSource, /await getAliyunRdsPool\(\)/)
  assert.match(kmsSource, /Action: "GetSecretValue"/)
  assert.match(kmsSource, /AssumeRoleWithOIDC/)
  assert.match(kmsSource, /ALIBABA_CLOUD_ROLE_ARN/)
  assert.match(kmsSource, /ALIBABA_CLOUD_OIDC_PROVIDER_ARN/)
  assert.match(kmsSource, /ALIBABA_CLOUD_OIDC_TOKEN_FILE/)
  assert.match(kmsSource, /DATABASE_URL_CN_SECRET_NAME/)
  assert.match(kmsSource, /SignatureMethod: "HMAC-SHA1"/)
  assert.match(kmsSource, /SecretData/)
})
