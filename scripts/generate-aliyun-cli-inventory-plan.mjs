#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const DEFAULT_CLOUD_ACCESS_OBSERVATION_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-access.local.json")
const DEFAULT_OUTPUT_FILE = ""
const DEFAULT_MARKDOWN_FILE = ""
const EXPECTED_REGION = "cn-hangzhou"

const SECRET_VALUE_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /gh[pousr]_[A-Za-z0-9_]{30,}/,
  /xox[baprs]-[A-Za-z0-9-]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /LTAI[A-Za-z0-9]{12,}/,
  /secret_[A-Za-z0-9]{20,}/,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
  /:\/\/[^\s:@]+:[^\s@]+@/,
  /(password|passwd|pwd|token|secret|access[_-]?key)\s*[:=]\s*[^,\s]{8,}/i,
]

function parseArgs(argv) {
  const args = {
    cloudAccessObservationFile: DEFAULT_CLOUD_ACCESS_OBSERVATION_FILE,
    out: DEFAULT_OUTPUT_FILE,
    markdown: DEFAULT_MARKDOWN_FILE,
  }
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") continue
    if (arg === "--cloud-access-observation") {
      args.cloudAccessObservationFile = resolveValue(argv[++index], "--cloud-access-observation")
      continue
    }
    if (arg === "--out") {
      args.out = resolveValue(argv[++index], "--out")
      continue
    }
    if (arg === "--markdown") {
      args.markdown = resolveValue(argv[++index], "--markdown")
      continue
    }
    if (arg === "--help" || arg === "-h") {
      printHelp()
      process.exit(0)
    }
    throw new Error(`unknown_arg:${arg}`)
  }
  return args
}

function resolveValue(value, name) {
  if (!value) throw new Error(`missing_value:${name}`)
  return isAbsolute(value) ? value : resolve(process.cwd(), value)
}

function runNodeJson(label, args) {
  const result = spawnSync(process.execPath, args, {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 30,
  })
  const stdout = (result.stdout || "").trim()
  const stderr = (result.stderr || "").trim()
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${label}_failed:${result.status}\n${stderr || stdout}`)
  }
  try {
    return JSON.parse(stdout)
  } catch (error) {
    throw new Error(`invalid_json_from_${label}:${error instanceof Error ? error.message : String(error)}`)
  }
}

function writeText(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content.endsWith("\n") ? content : `${content}\n`, { mode: 0o600 })
}

function findSecretLikeValues(value, path = "$", matches = []) {
  if (typeof value === "string") {
    if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) matches.push(path)
    return matches
  }
  if (!value || typeof value !== "object") return matches
  if (Array.isArray(value)) {
    value.forEach((item, index) => findSecretLikeValues(item, `${path}[${index}]`, matches))
    return matches
  }
  for (const [key, nested] of Object.entries(value)) {
    findSecretLikeValues(nested, `${path}.${key}`, matches)
  }
  return matches
}

function buildInventoryPlan(cloudAccess) {
  const canReadCloudNow = cloudAccess.canReadCloudNow === true
  const blockers = [
    ...(Array.isArray(cloudAccess.blockers) ? cloudAccess.blockers : []),
  ]
  const status = canReadCloudNow ? "ready_to_run_readonly" : "blocked_until_cli_configured"
  const operations = [
    {
      id: "I01_SAE_RUNTIME",
      title: "SAE production-cn runtime inventory",
      product: "sae",
      region: EXPECTED_REGION,
      readOnly: true,
      status,
      consoleFallback: "阿里云控制台 -> SAE -> cn-hangzhou -> 应用列表",
      commandPlan: [
        {
          command: "aliyun sae ListApplications --region cn-hangzhou",
          purpose: "Find the production-cn SAE application id and verify target app name.",
          helpCommand: "aliyun sae ListApplications --help",
        },
        {
          command: "aliyun sae DescribeApplicationConfig --region cn-hangzhou --AppId <APP_ID>",
          purpose: "Verify container port, health path, image source, env injection mode, and vSwitch/security group references without printing secret values.",
          helpCommand: "aliyun sae DescribeApplicationConfig --help",
        },
        {
          command: "aliyun sae DescribeApplicationStatus --region cn-hangzhou --AppId <APP_ID>",
          purpose: "Verify runtime status after the application exists.",
          helpCommand: "aliyun sae DescribeApplicationStatus --help",
        },
        {
          command: "aliyun sae ListLogConfigs --region cn-hangzhou --AppId <APP_ID>",
          purpose: "Verify SAE log shipping is attached to the expected SLS project/logstore.",
          helpCommand: "aliyun sae ListLogConfigs --help",
        },
      ],
      writeTargets: ["deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.runtime"],
      forbiddenCommands: ["DeployApplication", "StartApplication", "StopApplication", "UpdateApplication", "DeleteApplication"],
    },
    {
      id: "I02_ACR_IMAGE",
      title: "ACR repository and production-cn image inventory",
      product: "cr",
      region: EXPECTED_REGION,
      readOnly: true,
      status,
      consoleFallback: "阿里云控制台 -> 容器镜像服务 ACR -> cn-hangzhou -> 实例/命名空间/仓库",
      commandPlan: [
        {
          command: "aliyun cr ListInstance --region cn-hangzhou",
          purpose: "Find the ACR instance id without purchasing or changing registry settings.",
          helpCommand: "aliyun cr ListInstance --help",
        },
        {
          command: "aliyun cr ListNamespace --region cn-hangzhou --InstanceId <INSTANCE_ID>",
          purpose: "Verify namespace exists.",
          helpCommand: "aliyun cr ListNamespace --help",
        },
        {
          command: "aliyun cr ListRepository --region cn-hangzhou --InstanceId <INSTANCE_ID> --RepoNamespace <NAMESPACE>",
          purpose: "Verify repository meiye-huajing-app-api exists.",
          helpCommand: "aliyun cr ListRepository --help",
        },
        {
          command: "aliyun cr ListRepoTag --region cn-hangzhou --InstanceId <INSTANCE_ID> --RepoNamespace <NAMESPACE> --RepoName meiye-huajing-app-api",
          purpose: "Verify production-cn tag and digest evidence.",
          helpCommand: "aliyun cr ListRepoTag --help",
        },
      ],
      writeTargets: [
        "deploy/aliyun-production-cn.image-publish.local.json -> acr",
        "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.acr",
      ],
      forbiddenCommands: ["GetAuthorizationToken", "CreateRepository", "DeleteRepository", "CreateInstance", "UpdateRepository"],
    },
    {
      id: "I03_DNS_API_DOMAIN",
      title: "api-cn DNS and HTTPS route inventory",
      product: "alidns",
      region: EXPECTED_REGION,
      readOnly: true,
      status,
      consoleFallback: "阿里云控制台 -> 云解析 DNS -> ipgongchang.xin -> 解析记录",
      commandPlan: [
        {
          command: "aliyun alidns DescribeSubDomainRecords --SubDomain api-cn.ipgongchang.xin",
          purpose: "Verify api-cn record target, status, and TTL.",
          helpCommand: "aliyun alidns DescribeSubDomainRecords --help",
        },
        {
          command: "aliyun alidns DescribeDomainRecords --DomainName ipgongchang.xin --RRKeyWord api-cn",
          purpose: "Cross-check api-cn record from the parent domain record list.",
          helpCommand: "aliyun alidns DescribeDomainRecords --help",
        },
      ],
      writeTargets: ["deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomain"],
      forbiddenCommands: ["AddDomainRecord", "UpdateDomainRecord", "DeleteDomainRecord", "SetDomainRecordStatus"],
    },
    {
      id: "I04_DNS_ASSET_DOMAIN",
      title: "assets-cn DNS and HTTPS route inventory",
      product: "alidns",
      region: EXPECTED_REGION,
      readOnly: true,
      status,
      consoleFallback: "阿里云控制台 -> 云解析 DNS -> ipgongchang.xin -> 解析记录",
      commandPlan: [
        {
          command: "aliyun alidns DescribeSubDomainRecords --SubDomain assets-cn.ipgongchang.xin",
          purpose: "Verify assets-cn record target, status, and TTL.",
          helpCommand: "aliyun alidns DescribeSubDomainRecords --help",
        },
        {
          command: "aliyun alidns DescribeDomainRecords --DomainName ipgongchang.xin --RRKeyWord assets-cn",
          purpose: "Cross-check assets-cn record from the parent domain record list.",
          helpCommand: "aliyun alidns DescribeDomainRecords --help",
        },
      ],
      writeTargets: ["deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.assetDomain"],
      forbiddenCommands: ["AddDomainRecord", "UpdateDomainRecord", "DeleteDomainRecord", "SetDomainRecordStatus"],
    },
    {
      id: "I05_OSS_AUDIO_BUCKET",
      title: "OSS service-record audio bucket inventory",
      product: "oss",
      region: EXPECTED_REGION,
      readOnly: true,
      status,
      consoleFallback: "阿里云控制台 -> OSS -> meiye-huajing-service-records-production-cn",
      commandPlan: [
        {
          command: "aliyun oss stat oss://meiye-huajing-service-records-production-cn",
          purpose: "Verify bucket existence and region metadata only.",
          helpCommand: "aliyun oss help",
        },
        {
          command: "aliyun oss cors get oss://meiye-huajing-service-records-production-cn",
          purpose: "Verify CORS policy needed by service-record uploads.",
          helpCommand: "aliyun oss help",
        },
      ],
      writeTargets: ["deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.ossAudio"],
      forbiddenCommands: ["aliyun oss cp", "aliyun oss cat", "aliyun oss sign", "aliyun oss rm", "aliyun oss mb", "aliyun oss set-acl"],
    },
    {
      id: "I06_SLS_ALERTS",
      title: "SLS project, logstore, and alert inventory",
      product: "sls",
      region: EXPECTED_REGION,
      readOnly: true,
      status,
      consoleFallback: "阿里云控制台 -> 日志服务 SLS -> Project meiye-huajing-app-prod-cn",
      commandPlan: [
        {
          command: "aliyun sls ListProject --region cn-hangzhou",
          purpose: "Verify the production-cn SLS project is visible.",
          helpCommand: "aliyun sls ListProject --help",
        },
        {
          command: "aliyun sls ListLogStores --project meiye-huajing-app-prod-cn",
          purpose: "Verify app-api logstore exists.",
          helpCommand: "aliyun sls ListLogStores --help",
        },
        {
          command: "aliyun sls ListAlerts --project meiye-huajing-app-prod-cn",
          purpose: "Verify alert rules exist without reading log contents.",
          helpCommand: "aliyun sls ListAlerts --help",
        },
        {
          command: "aliyun sls ListDashboard --project meiye-huajing-app-prod-cn",
          purpose: "Verify dashboard coverage for APP API runtime observation.",
          helpCommand: "aliyun sls ListDashboard --help",
        },
      ],
      writeTargets: ["deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.slsAlerts"],
      forbiddenCommands: ["CreateAlert", "UpdateAlert", "DeleteAlert", "CreateLogStore", "DeleteLogStore", "GetLogs"],
    },
    {
      id: "I07_CERT_HTTPS",
      title: "HTTPS certificate inventory",
      product: "cas",
      region: EXPECTED_REGION,
      readOnly: true,
      status,
      consoleFallback: "阿里云控制台 -> 数字证书管理服务 -> 证书列表/部署任务",
      commandPlan: [
        {
          command: "aliyun cas ListUserCertificateOrder --region cn-hangzhou",
          purpose: "Verify certificate order/list evidence for api-cn and assets-cn.",
          helpCommand: "aliyun cas ListUserCertificateOrder --help",
        },
        {
          command: "aliyun cas ListDeploymentJob --region cn-hangzhou",
          purpose: "Verify deployment job evidence without downloading certificate material.",
          helpCommand: "aliyun cas ListDeploymentJob --help",
        },
      ],
      writeTargets: [
        "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomain",
        "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.assetDomain",
      ],
      forbiddenCommands: ["GetUserCertificateDetail", "CreateCertificate", "DeleteCertificate", "CreateDeploymentJob"],
    },
    {
      id: "I08_RDS_POSTGRES",
      title: "RDS PostgreSQL production-cn data-layer inventory",
      product: "rds",
      region: EXPECTED_REGION,
      readOnly: true,
      status,
      consoleFallback: "阿里云控制台 -> RDS -> cn-hangzhou -> PostgreSQL 实例",
      commandPlan: [
        {
          command: "aliyun rds DescribeDBInstances --RegionId cn-hangzhou --Engine PostgreSQL",
          purpose: "Verify whether a production-cn PostgreSQL RDS instance exists before treating DATABASE_URL_CN as available.",
          helpCommand: "aliyun rds DescribeDBInstances --help",
        },
        {
          command: "aliyun rds DescribeDBInstances --RegionId cn-hangzhou",
          purpose: "Cross-check all RDS engines in cn-hangzhou without reading connection strings or credentials.",
          helpCommand: "aliyun rds DescribeDBInstances --help",
        },
      ],
      writeTargets: ["release artifacts -> bridgeDataLayer.databaseUrlCnStatus"],
      forbiddenCommands: ["CreateDBInstance", "ModifyDBInstance", "DeleteDBInstance", "CreateDatabase", "CreateAccount"],
    },
    {
      id: "I09_TAIR_REDIS",
      title: "Redis/Tair production-cn cache inventory",
      product: "r-kvstore",
      region: EXPECTED_REGION,
      readOnly: true,
      status,
      consoleFallback: "阿里云控制台 -> Tair/Redis -> cn-hangzhou -> 实例",
      commandPlan: [
        {
          command: "aliyun r-kvstore DescribeInstances --RegionId cn-hangzhou",
          purpose: "Verify whether a production-cn Redis/Tair instance exists before treating REDIS_URL_CN as available.",
          helpCommand: "aliyun r-kvstore DescribeInstances --help",
        },
      ],
      writeTargets: ["release artifacts -> bridgeDataLayer.redisUrlCnStatus"],
      forbiddenCommands: ["CreateInstance", "ModifyInstanceAttribute", "DeleteInstance", "RestartInstance", "TransformToPrePaid"],
    },
  ]

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    environment: "production-cn",
    region: EXPECTED_REGION,
    containsValues: false,
    readOnlyOnly: true,
    cloudApiCalled: false,
    cloudMutationPerformed: false,
    mutationPerformed: false,
    status,
    canRunReadOnlyInventoryNow: canReadCloudNow,
    blockers: [...new Set(blockers)],
    cloudAccess: {
      cli: cloudAccess.cli || {},
      configFiles: cloudAccess.configFiles || [],
      canReadCloudNow,
      blockers: cloudAccess.blockers || [],
      cloudShellObservation: cloudAccess.cloudShellObservation || null,
    },
    runPolicy: [
      "Run this plan only after Aliyun CLI is configured in the operator account or Cloud Shell.",
      "Use --dryrun or each API --help first when parameter shape is uncertain.",
      "Do not pass AccessKeyId, AccessKeySecret, AppSecret, registry password, STS token, or cookies on the command line.",
      "Copy only resource names, booleans, status labels, timestamps, region labels, and digest evidence into *.local.json files.",
      "Any Create/Update/Delete/Deploy/Start/Stop/Push/Login/import action still requires separate action-time authorization.",
    ],
    operations,
    forbiddenOperations: [
      "Create*",
      "Update*",
      "Delete*",
      "DeployApplication",
      "StartApplication",
      "StopApplication",
      "GetAuthorizationToken",
      "GetUserCertificateDetail",
      "aliyun oss cp",
      "aliyun oss cat",
      "aliyun oss sign",
      "docker login/push",
      "SAE env import or mutation",
      "DNS record mutation",
      "OSS object download/upload/delete",
      "SLS log content query by default",
    ],
    summary: {
      totalOperations: operations.length,
      readyOperations: canReadCloudNow ? operations.length : 0,
      blockedOperations: canReadCloudNow ? 0 : operations.length,
      commandTemplates: operations.reduce((total, item) => total + item.commandPlan.length, 0),
      requiresActionTimeConfirmation: [
        "running cloud read-only inventory commands against the logged-in Aliyun account",
        "writing non-secret confirmation evidence into local .local.json files",
      ],
    },
  }
}

function renderMarkdown(report) {
  return [
    "# 阿里云 CLI 只读资源盘点计划",
    "",
    `- generatedAt: ${report.generatedAt}`,
    `- environment: ${report.environment}`,
    `- region: ${report.region}`,
    `- status: ${report.status}`,
    `- canRunReadOnlyInventoryNow: ${report.canRunReadOnlyInventoryNow}`,
    `- cloudApiCalled: ${report.cloudApiCalled}`,
    `- cloudMutationPerformed: ${report.cloudMutationPerformed}`,
    `- containsValues: ${report.containsValues}`,
    "",
    "## 阻塞项",
    "",
    ...(report.blockers.length ? report.blockers.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## 执行规则",
    "",
    ...report.runPolicy.map((item) => `- ${item}`),
    "",
    "## 盘点命令",
    "",
    ...report.operations.flatMap((operation) => [
      `### ${operation.id} ${operation.title}`,
      "",
      `- product: ${operation.product}`,
      `- status: ${operation.status}`,
      `- consoleFallback: ${operation.consoleFallback}`,
      `- writeTargets: ${operation.writeTargets.join("; ")}`,
      "",
      ...operation.commandPlan.flatMap((item) => [
        `- command: \`${item.command}\``,
        `  purpose: ${item.purpose}`,
        `  help: \`${item.helpCommand}\``,
      ]),
      `- forbiddenCommands: ${operation.forbiddenCommands.join(", ")}`,
      "",
    ]),
    "## 禁止动作",
    "",
    ...report.forbiddenOperations.map((item) => `- ${item}`),
    "",
  ].join("\n")
}

function main() {
  const args = parseArgs(process.argv)
  const accessArgs = ["scripts/check-aliyun-cloud-access.mjs"]
  if (existsSync(args.cloudAccessObservationFile)) {
    accessArgs.push("--cloud-access-observation", args.cloudAccessObservationFile)
  }
  const cloudAccess = runNodeJson("cloud_access", accessArgs)
  const report = buildInventoryPlan(cloudAccess)
  const secretLikePaths = findSecretLikeValues(report)
  report.secretLeakCheck = {
    ok: secretLikePaths.length === 0,
    secretLikePaths,
  }
  if (!report.secretLeakCheck.ok) {
    report.ok = false
    report.blockers.push(`contains_secret_like_values:${secretLikePaths.join(",")}`)
  }
  if (args.out) writeText(args.out, JSON.stringify(report, null, 2))
  if (args.markdown) writeText(args.markdown, renderMarkdown(report))
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exit(1)
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/generate-aliyun-cli-inventory-plan.mjs [--out report.json] [--markdown report.md]",
    "",
    "Generates a non-mutating Aliyun CLI read-only inventory command plan.",
    "It reuses scripts/check-aliyun-cloud-access.mjs for local CLI/config state and never calls cloud APIs.",
  ].join("\n"))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
