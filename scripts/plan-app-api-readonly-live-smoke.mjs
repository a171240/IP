#!/usr/bin/env node

import { pathToFileURL } from "node:url"
import { HEALTH_PROBES } from "./check-app-api-online-readonly-boundary.mjs"
import {
  CONTENT_XHS_L3_PERMISSION_PROBES,
  CONTENT_XHS_L3_PERMISSION_VARIABLES,
  L3_PERMISSION_PROBES,
  L3_PERMISSION_VARIABLES,
  READ_ONLY_PROBES,
  REQUIRED_VARIABLES,
  SKIPPED_MUTATING_ENDPOINTS,
} from "./check-app-api-live-smoke-env.mjs"

const DEFAULT_BOUNDARY_REPORT = "/tmp/app-api-online-readonly-boundary.json"
const DEFAULT_TIMEOUT_MS = 15_000

function parseArgs(argv) {
  const args = {
    boundaryReport: DEFAULT_BOUNDARY_REPORT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  }

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--boundary-report") {
      args.boundaryReport = requireValue(argv[++index], "--boundary-report")
      continue
    }
    if (arg === "--timeout-ms") {
      const value = Number(requireValue(argv[++index], "--timeout-ms"))
      if (!Number.isFinite(value) || value < 1_000) throw new Error("invalid_timeout_ms")
      args.timeoutMs = value
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

function requireValue(value, name) {
  if (!value) throw new Error(`missing_value:${name}`)
  return String(value)
}

function buildPlan(args) {
  const onlineBoundaryProbes = [...HEALTH_PROBES, ...READ_ONLY_PROBES].map(publicProbe)
  const readOnlySmokeProbes = READ_ONLY_PROBES.map(publicProbe)
  const contentXhsL3PermissionProbes = CONTENT_XHS_L3_PERMISSION_PROBES.map(publicProbe)
  const l3PermissionProbes = L3_PERMISSION_PROBES.map(publicProbe)

  return {
    ok: true,
    mode: "dry_run_plan",
    generatedAt: new Date().toISOString(),
    networkRequestsAttempted: false,
    envRead: false,
    tokenRead: false,
    envFileRead: false,
    requestBodySent: false,
    mutatingSmokeAuthorizedHere: false,
    writesAuthorizedHere: false,
    requiredInputs: REQUIRED_VARIABLES.map((item) => ({
      name: item.name,
      description: item.description,
      value: item.kind === "secret_token" ? "redacted_not_read" : "not_read",
      source: "shell_env_at_execution_time",
    })),
    requiredL3PermissionInputs: L3_PERMISSION_VARIABLES.map((item) => ({
      name: item.name,
      required: item.required === true,
      description: item.description,
      value: item.kind === "secret_token" || item.kind === "opaque_id"
        ? "redacted_not_read"
        : "not_read",
      source: "shell_env_at_execution_time",
    })),
    requiredContentXhsL3PermissionInputs: CONTENT_XHS_L3_PERMISSION_VARIABLES.map((item) => ({
      name: item.name,
      required: item.required === true,
      description: item.description,
      value: item.kind === "secret_token" || item.kind === "opaque_id"
        ? "redacted_not_read"
        : "not_read",
      source: "shell_env_at_execution_time",
    })),
    requiredExternalGates: [
      "APP_BASE_URL must be a non-local HTTPS production-cn URL unless a local stub is explicitly allowed for tests",
      "APP_DEVICE_ID must be allowlisted for the smoke operator/device",
      "APP_EMPLOYEE_TOKEN and APP_MANAGER_TOKEN must be supplied only in the shell that executes live smoke",
      "online-readonly-boundary must return ok=true, routeBlockers=[], and grouped[404]=0",
      "read-only execution still requires APP_READ_ONLY_LIVE_SMOKE=true or --execute-read-only",
      "L3 permission execution additionally requires APP_L3_PERMISSION_SMOKE=true or --execute-l3-permission, APP_MANAGER_SERVICE_RECORD_SESSION_ID_READONLY, APP_CROSS_STORE_SESSION_ID_READONLY, and APP_UNBOUND_TOKEN for content-xhs negative checks",
    ],
    sequence: [
      {
        id: "env_preflight",
        command: "corepack pnpm run aliyun:app-api:live-env",
        purpose: "validate required variable names, formats, placeholders, and redacted output before any network call",
        networkRequestsAttempted: false,
        readsEnvAtExecutionTime: true,
        readsEnvInThisPlan: false,
        expectedExitBeforeInputs: 1,
      },
      {
        id: "online_readonly_boundary",
        command: `corepack pnpm run aliyun:app-api:online-readonly-boundary -- --base-url "$APP_BASE_URL" --timeout-ms ${args.timeoutMs} > ${args.boundaryReport}`,
        purpose: "probe deployed route boundary with unauthenticated GET requests and no body",
        networkRequestsAttemptedByThisPlan: false,
        networkRequestsAttemptedAtExecutionTime: true,
        tokenSent: false,
        requestBodySent: false,
        outputReport: args.boundaryReport,
      },
      {
        id: "execution_preflight",
        command: `corepack pnpm run aliyun:app-api:live-env -- --online-boundary-report ${args.boundaryReport}`,
        purpose: "confirm env readiness and clean online boundary report while keeping read-only execution switch off",
        networkRequestsAttempted: false,
        expectedUntilExecutionSwitch: "APP_READ_ONLY_LIVE_SMOKE:missing_or_false",
      },
      {
        id: "read_only_smoke_execute",
        command: `corepack pnpm run aliyun:app-api:readonly-smoke -- --online-boundary-report ${args.boundaryReport}`,
        purpose: "execute token-backed GET-only smoke after explicit read-only authorization and a clean boundary report",
        requiresExplicitAuthorization: true,
        networkRequestsAttemptedByThisPlan: false,
        networkRequestsAttemptedAtExecutionTime: true,
        methodsAllowed: ["GET"],
        tokenValuesPrinted: false,
        responseBodiesPrinted: false,
      },
      {
        id: "content_xhs_l3_permission_smoke_execute",
        command: `corepack pnpm run aliyun:app-api:content-xhs-l3-smoke -- --online-boundary-report ${args.boundaryReport}`,
        purpose: "execute GET-only content-xhs L3 probes after explicit L3 authorization: employee drafts 200, manager drafts 200, and unbound drafts 403",
        requiresExplicitAuthorization: true,
        authorizationId: "CONTENT_XHS_L3_PERMISSION_READONLY_EXECUTION_AUTHORIZATION",
        networkRequestsAttemptedByThisPlan: false,
        networkRequestsAttemptedAtExecutionTime: true,
        methodsAllowed: ["GET"],
        tokenValuesPrinted: false,
        responseBodiesPrinted: false,
      },
      {
        id: "l3_permission_smoke_execute",
        command: `corepack pnpm run aliyun:app-api:l3-permission-smoke -- --online-boundary-report ${args.boundaryReport}`,
        purpose: "execute GET-only L3 permission probes after explicit L3 authorization: content-xhs employee/manager/unbound checks plus service-record manager/employee/cross-store checks",
        requiresExplicitAuthorization: true,
        authorizationId: "L3_PERMISSION_READONLY_EXECUTION_AUTHORIZATION",
        networkRequestsAttemptedByThisPlan: false,
        networkRequestsAttemptedAtExecutionTime: true,
        methodsAllowed: ["GET"],
        tokenValuesPrinted: false,
        responseBodiesPrinted: false,
      },
    ],
    redaction: {
      noSecretValuesPrintedByThisPlan: true,
      tokenEnvNames: [
        "APP_EMPLOYEE_TOKEN",
        "APP_MANAGER_TOKEN",
        "APP_CROSS_STORE_MANAGER_TOKEN",
        "APP_UNBOUND_TOKEN",
      ],
      publicTokenValue: "redacted",
      responseSecretEchoPolicy: "fail_probe_if_response_contains_input_token",
    },
    onlineBoundary: {
      reportPath: args.boundaryReport,
      getOnly: true,
      tokenSent: false,
      requestBodySent: false,
      blockerPolicy: {
        health: "status missing or >=500 blocks",
        appRoutes: "status missing, 404, or >=500 blocks",
        deployed404: "blocked until online artifact serves the source-backed route",
      },
      probes: onlineBoundaryProbes,
    },
    readOnlySmoke: {
      getOnly: true,
      tokenBacked: true,
      successPolicy: "each probe must return a 2xx JSON response and must not echo input token values",
      probes: readOnlySmokeProbes,
    },
    l3PermissionSmoke: {
      getOnly: true,
      tokenBacked: true,
      status: "PLAN_READY_NOT_EXECUTED",
      authorizationId: "L3_PERMISSION_READONLY_EXECUTION_AUTHORIZATION",
      successPolicy: "content-xhs employee and manager drafts must pass, unbound drafts must deny, service-record same-store list/detail must pass, and employee/cross-store negative probes must deny or hide session data",
      blockedOutcomes: [
        "BLOCKED_NO_MANAGER_RECORD_ID",
        "BLOCKED_CROSS_STORE_INPUT",
        "BLOCKED_UNBOUND_TOKEN_INPUT",
      ],
      outputEvidencePath: "docs/app-production-cn-l3-permission-smoke-current.json",
      probes: l3PermissionProbes,
    },
    contentXhsL3PermissionSmoke: {
      getOnly: true,
      tokenBacked: true,
      status: "PLAN_READY_NOT_EXECUTED",
      authorizationId: "CONTENT_XHS_L3_PERMISSION_READONLY_EXECUTION_AUTHORIZATION",
      successPolicy: "content-xhs employee and manager drafts must pass and unbound drafts must deny without service-record session inputs",
      blockedOutcomes: [
        "BLOCKED_CONTENT_XHS_TOKEN_INPUTS_MISSING",
        "BLOCKED_ONLINE_BOUNDARY_REPORT_MISSING",
      ],
      outputEvidencePath: "docs/app-production-cn-content-xhs-l3-permission-smoke-current.json",
      probes: contentXhsL3PermissionProbes,
    },
    skippedMutatingEndpoints: SKIPPED_MUTATING_ENDPOINTS,
    forbiddenActions: [
      "no write smoke",
      "no invite creation or accept",
      "no service-record session creation",
      "no OSS upload or signed action execution",
      "no ASR/process/publish/payment POST",
      "no production deploy, promote, alias, database write, or git push",
      "no content-xhs L3 permission execution without CONTENT_XHS_L3_PERMISSION_READONLY_EXECUTION_AUTHORIZATION",
      "no L3 permission execution without L3_PERMISSION_READONLY_EXECUTION_AUTHORIZATION",
    ],
  }
}

function publicProbe(probe) {
  return {
    id: probe.id,
    scope: probe.scope,
    role: probe.role || null,
    method: probe.method,
    path: probe.path,
    expectedStatuses: probe.expectedStatuses || null,
    negativePermissionProbe: probe.negativePermissionProbe === true,
    containsSessionEnvName: probe.containsSessionEnvName || null,
    description: probe.description,
  }
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/plan-app-api-readonly-live-smoke.mjs",
    "  node scripts/plan-app-api-readonly-live-smoke.mjs --boundary-report /tmp/app-api-online-readonly-boundary.json",
    "",
    "Safety:",
    "  Dry-run plan only.",
    "  Reads no environment variables, env files, or token values.",
    "  Sends no network requests and authorizes no write smoke.",
  ].join("\n"))
}

async function main() {
  try {
    console.log(JSON.stringify(buildPlan(parseArgs(process.argv)), null, 2))
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      mode: "dry_run_plan",
      networkRequestsAttempted: false,
      envRead: false,
      tokenRead: false,
      error: error instanceof Error ? error.message : String(error),
    }, null, 2))
    process.exitCode = 1
  }
}

export {
  buildPlan,
  parseArgs,
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
