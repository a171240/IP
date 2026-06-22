const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")

test("Aliyun domain readiness detects special-use wildcard placeholders", () => {
  const source = read("scripts", "check-aliyun-domain-readiness.mjs")

  assert.match(source, /async function resolveWildcardDns/)
  assert.match(source, /function baseDomainFromHostname/)
  assert.match(source, /wildcard-proof-\$\{nonce\}\.\$\{baseDomain\}/)
  assert.match(source, /wildcardProbe/)
  assert.match(source, /dns_special_use_wildcard_ip/)
  assert.match(source, /198\.18\.0\.0\/15/)
})

test("Aliyun deployment docs record current api-cn and assets-cn wildcard blocker", () => {
  const deployDoc = read("docs", "DEPLOY_ALIYUN_PRODUCTION_CN.md")
  const releaseManifest = read("docs", "release-manifest-2026-06-21-app-aliyun-production-cn-bridge.md")

  assert.match(deployDoc, /`?api-cn\/assets-cn`? 当前命中 `?198\.18\.0\.0\/15`?/)
  assert.match(deployDoc, /随机子域也返回特殊用途地址/)
  assert.match(releaseManifest, /`?api-cn\/assets-cn`? 当前命中 `?198\.18\.0\.0\/15`?/)
  assert.match(releaseManifest, /阿里云 DNS 控制台[\s\S]{0,80}未显示显式 api-cn\/assets-cn 记录/)
})

test("Aliyun domain docs reject legacy api/ip records as APP production-cn evidence", () => {
  const deployDoc = read("docs", "DEPLOY_ALIYUN_PRODUCTION_CN.md")
  const checklist = read("docs", "app-production-cn-env-checklist.md")
  const releaseManifest = read("docs", "release-manifest-2026-06-21-app-aliyun-production-cn-bridge.md")

  assert.match(deployDoc, /106\.14\.241\.129[\s\S]{0,120}不能作为 APP production-cn/)
  assert.match(checklist, /106\.14\.241\.129[\s\S]{0,120}不能作为 `api-cn`/)
  assert.match(releaseManifest, /旧 `api` \/ `ip` A 记录指向 `106\.14\.241\.129`[\s\S]{0,120}不能复用为 APP production-cn/)
})
