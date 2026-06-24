#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

export const REQUIRED_ROUTES = [
  {
    scope: "health",
    route: "/api/healthz",
    file: "app/api/healthz/route.ts",
    methods: ["GET"],
  },
  {
    scope: "health",
    route: "/api/app/health",
    file: "app/api/app/health/route.ts",
    methods: ["GET"],
  },
  {
    scope: "auth",
    route: "/api/app/auth/wechat",
    file: "app/api/app/auth/wechat/route.ts",
    methods: ["POST"],
  },
  {
    scope: "auth",
    route: "/api/app/auth/logout",
    file: "app/api/app/auth/logout/route.ts",
    methods: ["POST"],
  },
  {
    scope: "auth",
    route: "/api/app/wechat/login",
    file: "app/api/app/wechat/login/route.ts",
    methods: ["POST"],
  },
  {
    scope: "account",
    route: "/api/app/profile",
    file: "app/api/app/profile/route.ts",
    methods: ["GET"],
  },
  {
    scope: "account",
    route: "/api/app/entitlements",
    file: "app/api/app/entitlements/route.ts",
    methods: ["GET"],
  },
  {
    scope: "store-admin",
    route: "/api/app/store-admin/overview",
    file: "app/api/app/store-admin/overview/route.ts",
    methods: ["GET"],
  },
  {
    scope: "store-admin",
    route: "/api/app/store-admin/members",
    file: "app/api/app/store-admin/members/route.ts",
    methods: ["GET"],
  },
  {
    scope: "store-admin",
    route: "/api/app/store-admin/analytics",
    file: "app/api/app/store-admin/analytics/route.ts",
    methods: ["GET"],
  },
  {
    scope: "invites",
    route: "/api/app/store-admin/invites",
    file: "app/api/app/store-admin/invites/route.ts",
    methods: ["POST"],
  },
  {
    scope: "invites",
    route: "/api/app/store-admin/invites/[token]/preview",
    file: "app/api/app/store-admin/invites/[token]/preview/route.ts",
    methods: ["GET"],
  },
  {
    scope: "invites",
    route: "/api/app/store-admin/invites/[token]/accept",
    file: "app/api/app/store-admin/invites/[token]/accept/route.ts",
    methods: ["POST"],
  },
  {
    scope: "invites",
    route: "/api/app/store-admin/invites/[token]/qrcode",
    file: "app/api/app/store-admin/invites/[token]/qrcode/route.ts",
    methods: ["GET"],
  },
  {
    scope: "context",
    route: "/api/app/store-profiles",
    file: "app/api/app/store-profiles/route.ts",
    methods: ["GET", "POST"],
  },
  {
    scope: "context",
    route: "/api/app/store-profiles/[profileId]",
    file: "app/api/app/store-profiles/[profileId]/route.ts",
    methods: ["GET", "PUT", "DELETE"],
  },
  {
    scope: "context",
    route: "/api/app/customer-profiles",
    file: "app/api/app/customer-profiles/route.ts",
    methods: ["GET", "POST"],
  },
  {
    scope: "context",
    route: "/api/app/customer-profiles/[profileId]",
    file: "app/api/app/customer-profiles/[profileId]/route.ts",
    methods: ["GET", "PUT", "DELETE"],
  },
  {
    scope: "context",
    route: "/api/app/scene-cards",
    file: "app/api/app/scene-cards/route.ts",
    methods: ["GET", "POST"],
  },
  {
    scope: "context",
    route: "/api/app/scene-cards/[cardId]",
    file: "app/api/app/scene-cards/[cardId]/route.ts",
    methods: ["GET", "PUT", "DELETE"],
  },
  {
    scope: "service-records",
    route: "/api/app/service-records/sessions",
    file: "app/api/app/service-records/sessions/route.ts",
    methods: ["GET", "POST"],
  },
  {
    scope: "service-records",
    route: "/api/app/service-records/sessions/[sessionId]",
    file: "app/api/app/service-records/sessions/[sessionId]/route.ts",
    methods: ["GET"],
  },
  {
    scope: "service-records",
    route: "/api/app/service-records/device-files/check",
    file: "app/api/app/service-records/device-files/check/route.ts",
    methods: ["POST"],
  },
  {
    scope: "service-records",
    route: "/api/app/service-records/sessions/[sessionId]/segments",
    file: "app/api/app/service-records/sessions/[sessionId]/segments/route.ts",
    methods: ["POST"],
  },
  {
    scope: "service-records",
    route: "/api/app/service-records/sessions/[sessionId]/oss-upload",
    file: "app/api/app/service-records/sessions/[sessionId]/oss-upload/route.ts",
    methods: ["POST"],
  },
  {
    scope: "service-records",
    route: "/api/app/service-records/sessions/[sessionId]/segments/oss",
    file: "app/api/app/service-records/sessions/[sessionId]/segments/oss/route.ts",
    methods: ["POST"],
  },
  {
    scope: "service-records",
    route: "/api/app/service-records/sessions/[sessionId]/markers",
    file: "app/api/app/service-records/sessions/[sessionId]/markers/route.ts",
    methods: ["POST"],
  },
  {
    scope: "service-records",
    route: "/api/app/service-records/sessions/[sessionId]/resume",
    file: "app/api/app/service-records/sessions/[sessionId]/resume/route.ts",
    methods: ["POST"],
  },
  {
    scope: "service-records",
    route: "/api/app/service-records/sessions/[sessionId]/end",
    file: "app/api/app/service-records/sessions/[sessionId]/end/route.ts",
    methods: ["POST"],
  },
  {
    scope: "service-records",
    route: "/api/app/service-records/sessions/[sessionId]/process",
    file: "app/api/app/service-records/sessions/[sessionId]/process/route.ts",
    methods: ["POST"],
  },
  {
    scope: "service-records",
    route: "/api/app/service-records/sessions/[sessionId]/asr/poll",
    file: "app/api/app/service-records/sessions/[sessionId]/asr/poll/route.ts",
    methods: ["POST"],
  },
  {
    scope: "service-records",
    route: "/api/app/service-records/sessions/[sessionId]/audio/[segmentId]",
    file: "app/api/app/service-records/sessions/[sessionId]/audio/[segmentId]/route.ts",
    methods: ["GET"],
  },
]

function exportedMethods(source) {
  const methods = new Set()
  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
    const patterns = [
      new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`),
      new RegExp(`export\\s+const\\s+${method}\\b`),
      new RegExp(`export\\s*\\{[^}]*\\b${method}\\b[^}]*\\}`),
    ]
    if (patterns.some((pattern) => pattern.test(source))) {
      methods.add(method)
    }
  }
  return methods
}

function main() {
  const failures = []
  const scopes = new Map()

  for (const item of REQUIRED_ROUTES) {
    const absolute = resolve(process.cwd(), item.file)
    if (!existsSync(absolute)) {
      failures.push({ route: item.route, file: item.file, error: "missing_file" })
      continue
    }
    const source = readFileSync(absolute, "utf8")
    const methods = exportedMethods(source)
    const missingMethods = item.methods.filter((method) => !methods.has(method))
    if (missingMethods.length) {
      failures.push({
        route: item.route,
        file: item.file,
        error: "missing_methods",
        missingMethods,
      })
      continue
    }
    scopes.set(item.scope, (scopes.get(item.scope) || 0) + 1)
  }

  const result = {
    checkedRoutes: REQUIRED_ROUTES.length,
    scopes: Object.fromEntries([...scopes.entries()].sort(([a], [b]) => a.localeCompare(b))),
    failures,
  }

  console.log(JSON.stringify(result, null, 2))
  if (failures.length) process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
