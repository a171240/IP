const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync, spawnSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))
const secretLike = /(sk-[A-Za-z0-9_-]{20,}|LTAI[A-Za-z0-9]{12,}|:\/\/[^\s:@]+:[^\s@]+@|AccessKeySecret\s*[:=]\s*\S{8,}|token\s*[:=]\s*\S{8,})/i

test("Aliyun CloudShell readonly collector is wired into scripts and deploy gates", () => {
  const pkg = readJson("package.json")
  const source = read("scripts", "generate-aliyun-cloudshell-readonly-collector.mjs")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")
  const specCheckOutput = execFileSync(process.execPath, [
    "scripts/check-aliyun-deployment-spec.mjs",
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  const specCheck = JSON.parse(specCheckOutput)

  assert.equal(pkg.scripts["aliyun:cloudshell:collector"], "node ./scripts/generate-aliyun-cloudshell-readonly-collector.mjs")
  assert.equal(pkg.scripts["aliyun:cloudshell:collector:bootstrap"], "node ./scripts/generate-aliyun-cloudshell-readonly-collector.mjs --print-bootstrap")
  assert.equal(pkg.scripts["aliyun:cloudshell:collector:test"], "node --test tests/aliyun-cloudshell-readonly-collector.static.test.js")
  assert.match(source, /--print-bootstrap/)
  assert.match(source, /buildBootstrapScript/)
  assert.match(source, /clipboardCommand/)
  assert.match(predeploy, /aliyun:cloudshell:collector:test/)
  assert.match(predeploy, /aliyun:cloudshell:collector/)
  assert.equal(deploySpec.cloudShellCollector.checkCommand, "corepack pnpm aliyun:cloudshell:collector")
  assert.equal(deploySpec.cloudShellCollector.script, "scripts/generate-aliyun-cloudshell-readonly-collector.mjs")
  assert.equal(deploySpec.cloudShellCollector.requiresConnectedCloudShell, true)
  assert.match(deploySpec.cloudShellCollector.scope, /never calls Aliyun cloud APIs/)
  assert.match(deploySpec.cloudShellCollector.secretsPolicy, /prints\/stores no raw stdout or stderr/)
  assert.match(releaseArtifacts, /cloudshell-readonly-collector\.py/)
  assert.match(releaseArtifacts, /cloudshell-readonly-bootstrap\.sh/)
  assert.match(releaseArtifacts, /cloudshellReadonlyCollectorBootstrap/)
  assert.match(releaseArtifacts, /cloudshellReadonlyCollector/)
  assert.match(releaseArtifacts, /cloudshell_readonly_collector/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:cloudshell:collector:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:cloudshell:collector"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:cloudshell:collector"))
  assert.ok(
    deploySpec.predeployChecks.indexOf("corepack pnpm aliyun:cloud:inventory-run") <
      deploySpec.predeployChecks.indexOf("corepack pnpm aliyun:cloudshell:collector"),
  )
  assert.ok(
    deploySpec.predeployChecks.indexOf("corepack pnpm aliyun:cloudshell:collector") <
      deploySpec.predeployChecks.indexOf("corepack pnpm aliyun:cloudshell:handoff"),
  )
  assert.equal(specCheck.ok, true)
})

test("Aliyun CloudShell readonly collector generator produces a value-free script", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-cloudshell-collector-"))
  const scriptPath = path.join(tmpdir, "collector.py")
  const bootstrapPath = path.join(tmpdir, "bootstrap.sh")
  const reportPath = path.join(tmpdir, "collector.json")
  const markdownPath = path.join(tmpdir, "collector.md")
  const output = execFileSync(process.execPath, [
    "scripts/generate-aliyun-cloudshell-readonly-collector.mjs",
    "--out",
    scriptPath,
    "--bootstrap",
    bootstrapPath,
    "--report",
    reportPath,
    "--markdown",
    markdownPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  const report = JSON.parse(output)
  const writtenReport = JSON.parse(fs.readFileSync(reportPath, "utf8"))
  const script = fs.readFileSync(scriptPath, "utf8")
  const bootstrap = fs.readFileSync(bootstrapPath, "utf8")
  const markdown = fs.readFileSync(markdownPath, "utf8")
  const printedBootstrap = execFileSync(process.execPath, [
    "scripts/generate-aliyun-cloudshell-readonly-collector.mjs",
    "--print-bootstrap",
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  const commands = report.operations.map((item) => item.command)

  assert.deepEqual(writtenReport, report)
  assert.equal(report.ok, true)
  assert.equal(report.currentScope, "backend_aliyun_only")
  assert.equal(report.executionMode, "generator_only")
  assert.equal(report.bootstrapFile, bootstrapPath)
  assert.equal(report.cloudShellScriptFile, "/tmp/meiye-aliyun-cloudshell-readonly-collector.py")
  assert.equal(report.cloudShellOutputFile, "/tmp/meiye-aliyun-readonly-inventory.local.json")
  assert.equal(report.clipboardCommand, "corepack pnpm aliyun:cloudshell:collector:bootstrap | pbcopy")
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.cloudApiCalled, false)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.allowEnv, "MEIYE_ALLOW_ALIYUN_CLOUDSHELL_READONLY")
  assert.equal(report.summary.operations, 9)
  assert.equal(report.summary.commands, 9)
  assert.equal(report.summary.forbiddenMutationCommands, 0)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.ok(report.runInstructions.some((item) => item.includes("aliyun:cloudshell:collector:bootstrap | pbcopy")))
  assert.ok(report.runInstructions.some((item) => item.includes("Paste the clipboard content into Aliyun CloudShell")))
  assert.ok(commands.includes("aliyun sae ListApplications --region cn-hangzhou"))
  assert.ok(commands.includes("aliyun cr ListInstance --region cn-hangzhou"))
  assert.ok(commands.includes("aliyun alidns DescribeSubDomainRecords --SubDomain api-cn.ipgongchang.xin"))
  assert.ok(commands.includes("aliyun oss stat oss://meiye-huajing-service-records-production-cn"))
  assert.ok(commands.includes("aliyun rds DescribeDBInstances --RegionId cn-hangzhou --Engine PostgreSQL"))
  assert.ok(commands.includes("aliyun r-kvstore DescribeInstances --RegionId cn-hangzhou"))
  assert.equal(commands.some((command) => /Create|Update|Delete|GetAuthorizationToken|DeployApplication/.test(command)), false)
  assert.equal(commands.some((command) => /[<>]/.test(command)), false)
  assert.match(script, /ALLOW_ENV = "MEIYE_ALLOW_ALIYUN_CLOUDSHELL_READONLY"/)
  assert.match(script, /subprocess\.run/)
  assert.match(script, /stdout=subprocess\.PIPE/)
  assert.match(script, /stderr=subprocess\.PIPE/)
  assert.match(script, /def summarize_resource/)
  assert.match(script, /resourceSummary=/)
  assert.match(script, /MEIYE_CLOUDSHELL_READONLY_INVENTORY_JSON_BEGIN/)
  assert.match(script, /Raw stdout\/stderr are not stored or printed/)
  assert.doesNotMatch(script, /print\(stdout|print\(stderr/)
  assert.doesNotMatch(script, /DescribeApplicationConfig/)
  assert.match(bootstrap, /cat > '\/tmp\/meiye-aliyun-cloudshell-readonly-collector\.py' <<'PY'/)
  assert.match(bootstrap, /MEIYE_ALLOW_ALIYUN_CLOUDSHELL_READONLY=1 python3/)
  assert.match(bootstrap, /MEIYE_CLOUDSHELL_READONLY_INVENTORY_JSON_BEGIN/)
  assert.match(printedBootstrap, /cat > '\/tmp\/meiye-aliyun-cloudshell-readonly-collector\.py' <<'PY'/)
  assert.match(printedBootstrap, /MEIYE_ALLOW_ALIYUN_CLOUDSHELL_READONLY=1 python3/)
  assert.match(markdown, /阿里云 CloudShell 只读采集器/)
  assert.match(markdown, /clipboardCommand: `corepack pnpm aliyun:cloudshell:collector:bootstrap \| pbcopy`/)
  assert.match(markdown, /bootstrapFile:/)
  assert.match(markdown, /secretLeakCheck: true/)
  assert.doesNotMatch(output, secretLike)
  assert.doesNotMatch(script, secretLike)
  assert.doesNotMatch(bootstrap, secretLike)
  assert.doesNotMatch(printedBootstrap, secretLike)
  assert.doesNotMatch(markdown, secretLike)
})

test("Aliyun CloudShell readonly collector summarizes resource evidence without raw output", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-cloudshell-collector-run-"))
  const scriptPath = path.join(tmpdir, "collector.py")
  const outputPath = path.join(tmpdir, "inventory.json")
  const fakeBin = path.join(tmpdir, "bin")
  const fakeAliyun = path.join(fakeBin, "aliyun")
  fs.mkdirSync(fakeBin)
  fs.writeFileSync(fakeAliyun, `#!/usr/bin/env node
const args = process.argv.slice(2);
const text = args.join(" ");
if (text.startsWith("sae ListApplications")) {
  console.log(JSON.stringify({ Applications: [{ AppName: "other-app" }] }));
} else if (text.startsWith("cr ListInstance")) {
  console.log(JSON.stringify({ Instances: [{ InstanceName: "meiye-huajing-app-api" }] }));
} else if (text.startsWith("alidns DescribeSubDomainRecords") && text.includes("api-cn.ipgongchang.xin")) {
  console.log(JSON.stringify({ DomainRecords: { Record: [{ Type: "CNAME" }], TotalCount: 1 } }));
} else if (text.startsWith("alidns DescribeSubDomainRecords") && text.includes("assets-cn.ipgongchang.xin")) {
  console.log(JSON.stringify({ DomainRecords: { Record: [] }, TotalCount: 0 }));
} else if (text.startsWith("oss stat")) {
  console.log("Location: oss-cn-hangzhou\\nACL: private\\nStorageClass: Standard");
} else if (text.startsWith("sls ListProject")) {
  console.log(JSON.stringify({ projects: [{ projectName: "meiye-huajing-app-prod-cn" }] }));
} else if (text.startsWith("cas ListUserCertificateOrder")) {
  console.log(JSON.stringify({ CertificateOrderList: [] }));
} else if (text.startsWith("rds DescribeDBInstances")) {
  console.log(JSON.stringify({ Items: { DBInstance: [{ DBInstanceDescription: "meiye-huajing-app-api-production-cn", Engine: "PostgreSQL" }] }, TotalRecordCount: 1 }));
} else if (text.startsWith("r-kvstore DescribeInstances")) {
  console.log(JSON.stringify({ Instances: [], TotalCount: 0 }));
} else {
  console.error("unexpected command", text);
  process.exit(12);
}
`, { mode: 0o700 })
  execFileSync(process.execPath, [
    "scripts/generate-aliyun-cloudshell-readonly-collector.mjs",
    "--out",
    scriptPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  const run = spawnSync("python3", [scriptPath, outputPath], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ""}`,
      MEIYE_ALLOW_ALIYUN_CLOUDSHELL_READONLY: "1",
    },
    maxBuffer: 1024 * 1024 * 20,
  })
  assert.equal(run.status, 0, run.stderr || run.stdout)
  const payload = JSON.parse(fs.readFileSync(outputPath, "utf8"))
  const byId = new Map(payload.operations.map((item) => [item.id, item]))
  const summary = (id) => byId.get(id).commandResults[0].outputSummary

  assert.equal(byId.get("I01_SAE_RUNTIME").status, "not_found")
  assert.match(summary("I01_SAE_RUNTIME"), /resourceSummary=.*targetAppPresent=false/)
  assert.equal(byId.get("I02_ACR_IMAGE").status, "observed")
  assert.match(summary("I02_ACR_IMAGE"), /targetInstanceOrNamespacePresent=true/)
  assert.equal(byId.get("I03_DNS_API_DOMAIN").status, "observed")
  assert.match(summary("I03_DNS_API_DOMAIN"), /recordCount=1/)
  assert.equal(byId.get("I04_DNS_ASSET_DOMAIN").status, "not_found")
  assert.match(summary("I04_DNS_ASSET_DOMAIN"), /recordCount=0/)
  assert.equal(byId.get("I05_OSS_AUDIO_BUCKET").status, "observed")
  assert.match(summary("I05_OSS_AUDIO_BUCKET"), /bucketExists=true/)
  assert.match(summary("I05_OSS_AUDIO_BUCKET"), /acl=private/)
  assert.equal(byId.get("I06_SLS_ALERTS").status, "observed")
  assert.match(summary("I06_SLS_ALERTS"), /targetProjectPresent=true/)
  assert.equal(byId.get("I07_CERT_HTTPS").status, "not_found")
  assert.match(summary("I07_CERT_HTTPS"), /certificateOrderCount=0/)
  assert.equal(byId.get("I08_RDS_POSTGRES").status, "observed")
  assert.match(summary("I08_RDS_POSTGRES"), /targetInstancePresent=true/)
  assert.match(summary("I08_RDS_POSTGRES"), /engines=PostgreSQL/)
  assert.equal(byId.get("I09_TAIR_REDIS").status, "not_found")
  assert.match(summary("I09_TAIR_REDIS"), /redisOrTairInstanceCount=0/)
  assert.doesNotMatch(JSON.stringify(payload), secretLike)
})

test("Aliyun CloudShell readonly collector refuses unsafe template commands", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-cloudshell-collector-unsafe-"))
  const template = readJson("deploy", "aliyun-production-cn.cloud-inventory-results.example.json")
  const unsafePath = path.join(tmpdir, "unsafe-template.json")
  template.operations[0].commandResults[0].command = "aliyun sae DeployApplication --region cn-hangzhou"
  fs.writeFileSync(unsafePath, JSON.stringify(template, null, 2))

  const result = spawnSync(process.execPath, [
    "scripts/generate-aliyun-cloudshell-readonly-collector.mjs",
    "--template",
    unsafePath,
    "--out",
    path.join(tmpdir, "collector.py"),
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 10,
  })

  assert.notEqual(result.status, 0)
  assert.match(result.stdout || result.stderr, /unsafe_command/)
  assert.doesNotMatch(result.stdout || result.stderr, secretLike)
})
