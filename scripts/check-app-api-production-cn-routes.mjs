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
    scope: "account",
    route: "/api/app/account/bootstrap",
    file: "app/api/app/account/bootstrap/route.ts",
    methods: ["POST"],
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
    scope: "service-records",
    route: "/api/app/store-admin/service-records",
    file: "app/api/app/store-admin/service-records/route.ts",
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

export const IMPLEMENTED_APP_FACADE_ROUTES = [
  {
    scope: "assets",
    route: "/api/app/assets/sign-read",
    file: "app/api/app/assets/sign-read/route.ts",
    methods: ["POST"],
  },
  {
    scope: "content-drafts",
    route: "/api/app/content-drafts",
    file: "app/api/app/content-drafts/route.ts",
    methods: ["GET", "POST"],
  },
  {
    scope: "knowledge-spaces",
    route: "/api/app/knowledge-spaces",
    file: "app/api/app/knowledge-spaces/route.ts",
    methods: ["GET"],
  },
  {
    scope: "knowledge-spaces",
    route: "/api/app/knowledge-spaces/[spaceId]",
    file: "app/api/app/knowledge-spaces/[...path]/route.ts",
    methods: ["GET"],
  },
  {
    scope: "knowledge-spaces",
    route: "/api/app/knowledge-spaces/[spaceId]/groups/[groupId]",
    file: "app/api/app/knowledge-spaces/[...path]/route.ts",
    methods: ["GET"],
  },
  {
    scope: "knowledge-spaces",
    route: "/api/app/knowledge-spaces/[spaceId]/groups/[groupId]/cards/[cardId]",
    file: "app/api/app/knowledge-spaces/[...path]/route.ts",
    methods: ["GET"],
  },
  {
    scope: "learning-progress",
    route: "/api/app/learning/progress",
    file: "app/api/app/learning/progress/route.ts",
    methods: ["GET"],
  },
  {
    scope: "learning-progress",
    route: "/api/app/learning/progress/events",
    file: "app/api/app/learning/progress/events/route.ts",
    methods: ["POST"],
  },
  {
    scope: "learning-progress",
    route: "/api/app/learning/progress/sync",
    file: "app/api/app/learning/progress/sync/route.ts",
    methods: ["POST"],
  },
  {
    scope: "content-poster",
    route: "/api/app/posters/templates",
    file: "app/api/app/posters/templates/route.ts",
    methods: ["GET"],
  },
  {
    scope: "content-poster",
    route: "/api/app/posters/history",
    file: "app/api/app/posters/history/route.ts",
    methods: ["GET"],
  },
  {
    scope: "content-poster",
    route: "/api/app/posters/generate",
    file: "app/api/app/posters/generate/route.ts",
    methods: ["POST"],
  },
  {
    scope: "content-xhs",
    route: "/api/app/xhs/generate-v4",
    file: "app/api/app/xhs/generate-v4/route.ts",
    methods: ["POST"],
  },
  {
    scope: "content-xhs",
    route: "/api/app/xhs/content/danger-check",
    file: "app/api/app/xhs/content/danger-check/route.ts",
    methods: ["POST"],
  },
  {
    scope: "content-xhs",
    route: "/api/app/xhs/drafts",
    file: "app/api/app/xhs/drafts/route.ts",
    methods: ["GET"],
  },
  {
    scope: "content-xhs",
    route: "/api/app/xhs/generate-cover-image",
    file: "app/api/app/xhs/generate-cover-image/route.ts",
    methods: ["POST"],
  },
  {
    scope: "content-private-copy",
    route: "/api/app/private-copy/generate",
    file: "app/api/app/private-copy/generate/route.ts",
    methods: ["POST"],
  },
  {
    scope: "content-private-copy",
    route: "/api/app/private-copy/drafts",
    file: "app/api/app/private-copy/drafts/route.ts",
    methods: ["GET"],
  },
  {
    scope: "voice-coach",
    route: "/api/app/voice-coach/sessions",
    file: "app/api/app/voice-coach/sessions/route.ts",
    methods: ["GET", "POST"],
  },
  {
    scope: "voice-coach",
    route: "/api/app/voice-coach/sessions/[sessionId]",
    file: "app/api/app/voice-coach/sessions/[sessionId]/route.ts",
    methods: ["GET"],
  },
  {
    scope: "voice-coach",
    route: "/api/app/voice-coach/sessions/[sessionId]/events",
    file: "app/api/app/voice-coach/sessions/[sessionId]/events/route.ts",
    methods: ["GET"],
  },
  {
    scope: "voice-coach",
    route: "/api/app/voice-coach/sessions/[sessionId]/turns/[turnId]/tts",
    file: "app/api/app/voice-coach/sessions/[sessionId]/turns/[turnId]/tts/route.ts",
    methods: ["POST"],
  },
  {
    scope: "voice-coach",
    route: "/api/app/voice-coach/sessions/[sessionId]/asr-preview",
    file: "app/api/app/voice-coach/sessions/[sessionId]/asr-preview/route.ts",
    methods: ["POST"],
  },
  {
    scope: "voice-coach",
    route: "/api/app/voice-coach/sessions/[sessionId]/beautician-turn/submit",
    file: "app/api/app/voice-coach/sessions/[sessionId]/beautician-turn/submit/route.ts",
    methods: ["POST"],
  },
  {
    scope: "voice-coach",
    route: "/api/app/voice-coach/sessions/[sessionId]/end",
    file: "app/api/app/voice-coach/sessions/[sessionId]/end/route.ts",
    methods: ["POST"],
  },
  {
    scope: "voice-coach",
    route: "/api/app/voice-coach/sessions/[sessionId]/report",
    file: "app/api/app/voice-coach/sessions/[sessionId]/report/route.ts",
    methods: ["GET"],
  },
]

export const APP_CLIENT_CONTRACT_ROUTES = [
  ...REQUIRED_ROUTES,
  ...IMPLEMENTED_APP_FACADE_ROUTES,
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

  for (const item of APP_CLIENT_CONTRACT_ROUTES) {
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
    checkedRoutes: APP_CLIENT_CONTRACT_ROUTES.length,
    requiredRoutes: REQUIRED_ROUTES.length,
    implementedFacadeRoutes: IMPLEMENTED_APP_FACADE_ROUTES.length,
    scopes: Object.fromEntries([...scopes.entries()].sort(([a], [b]) => a.localeCompare(b))),
    failures,
  }

  console.log(JSON.stringify(result, null, 2))
  if (failures.length) process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
