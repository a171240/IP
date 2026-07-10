#!/usr/bin/env node

import { APP_CLIENT_CONTRACT_ROUTES, IMPLEMENTED_APP_FACADE_ROUTES } from "./check-app-api-production-cn-routes.mjs"
import { PROBES } from "./smoke-app-api-production-cn.mjs"

const IMPLEMENTED_APP_FACADE_COVERAGE_PROBES = [
  {
    scope: "assets",
    method: "POST",
    path: "/api/app/assets/sign-read",
    body: {},
    expected: [{ status: 401 }],
  },
  {
    scope: "content-drafts",
    method: "GET",
    path: "/api/app/content-drafts",
    expected: [{ status: 401 }],
  },
  {
    scope: "content-drafts",
    method: "POST",
    path: "/api/app/content-drafts",
    body: {},
    expected: [{ status: 401 }],
  },
  {
    scope: "knowledge-spaces",
    method: "GET",
    path: "/api/app/knowledge-spaces",
    expected: [{ status: 401 }],
  },
  {
    scope: "knowledge-spaces",
    method: "GET",
    path: "/api/app/knowledge-spaces/app-smoke-space",
    expected: [{ status: 401 }],
  },
  {
    scope: "knowledge-spaces",
    method: "GET",
    path: "/api/app/knowledge-spaces/app-smoke-space/groups/app-smoke-group",
    expected: [{ status: 401 }],
  },
  {
    scope: "knowledge-spaces",
    method: "GET",
    path: "/api/app/knowledge-spaces/app-smoke-space/groups/app-smoke-group/cards/app-smoke-card",
    expected: [{ status: 401 }],
  },
  {
    scope: "learning-progress",
    method: "GET",
    path: "/api/app/learning/progress",
    expected: [{ status: 401 }],
  },
  {
    scope: "learning-progress",
    method: "POST",
    path: "/api/app/learning/progress/events",
    body: {},
    expected: [{ status: 401 }],
  },
  {
    scope: "learning-progress",
    method: "POST",
    path: "/api/app/learning/progress/sync",
    body: { events: [] },
    expected: [{ status: 401 }],
  },
  {
    scope: "content-poster",
    method: "GET",
    path: "/api/app/posters/templates",
    expected: [{ status: 401 }],
  },
  {
    scope: "content-poster",
    method: "GET",
    path: "/api/app/posters/history",
    expected: [{ status: 401 }],
  },
  {
    scope: "content-poster",
    method: "POST",
    path: "/api/app/posters/generate",
    body: {},
    expected: [{ status: 401 }],
  },
  {
    scope: "content-xhs",
    method: "POST",
    path: "/api/app/xhs/generate-v4",
    body: {},
    expected: [{ status: 401 }],
  },
  {
    scope: "content-xhs",
    method: "POST",
    path: "/api/app/xhs/content/danger-check",
    body: {},
    expected: [{ status: 401 }],
  },
  {
    scope: "content-xhs",
    method: "GET",
    path: "/api/app/xhs/drafts",
    expected: [{ status: 401 }],
  },
  {
    scope: "content-xhs",
    method: "POST",
    path: "/api/app/xhs/generate-cover-image",
    body: {},
    expected: [{ status: 401 }],
  },
  {
    scope: "content-private-copy",
    method: "POST",
    path: "/api/app/private-copy/generate",
    body: {},
    expected: [{ status: 401 }],
  },
  {
    scope: "content-private-copy",
    method: "GET",
    path: "/api/app/private-copy/drafts",
    expected: [{ status: 401 }],
  },
  {
    scope: "voice-coach",
    method: "GET",
    path: "/api/app/voice-coach/sessions",
    expected: [{ status: 401 }],
  },
  {
    scope: "voice-coach",
    method: "POST",
    path: "/api/app/voice-coach/sessions",
    body: {},
    expected: [{ status: 401 }],
  },
  {
    scope: "voice-coach",
    method: "GET",
    path: "/api/app/voice-coach/sessions/app-smoke-session",
    expected: [{ status: 401 }],
  },
  {
    scope: "voice-coach",
    method: "GET",
    path: "/api/app/voice-coach/sessions/app-smoke-session/events",
    expected: [{ status: 401 }],
  },
  {
    scope: "voice-coach",
    method: "POST",
    path: "/api/app/voice-coach/sessions/app-smoke-session/turns/app-smoke-turn/tts",
    body: {},
    expected: [{ status: 401 }],
  },
  {
    scope: "voice-coach",
    method: "POST",
    path: "/api/app/voice-coach/sessions/app-smoke-session/asr-preview",
    body: {},
    expected: [{ status: 401 }],
  },
  {
    scope: "voice-coach",
    method: "POST",
    path: "/api/app/voice-coach/sessions/app-smoke-session/beautician-turn/submit",
    body: {},
    expected: [{ status: 401 }],
  },
  {
    scope: "voice-coach",
    method: "POST",
    path: "/api/app/voice-coach/sessions/app-smoke-session/end",
    body: {},
    expected: [{ status: 401 }],
  },
  {
    scope: "voice-coach",
    method: "GET",
    path: "/api/app/voice-coach/sessions/app-smoke-session/report",
    expected: [{ status: 401 }],
  },
]

const NON_EXECUTED_MUTATION_COVERAGE_PROBES = [
  {
    scope: "account",
    method: "POST",
    path: "/api/app/account/bootstrap",
    expected: [{ status: 401 }],
  },
]

const COVERAGE_PROBES = [
  ...PROBES,
  ...IMPLEMENTED_APP_FACADE_COVERAGE_PROBES,
  ...NON_EXECUTED_MUTATION_COVERAGE_PROBES,
]

function routePattern(route) {
  const pattern = route
    .split("/")
    .map((part) => {
      if (!part) return ""
      if (/^\[[^\]]+\]$/.test(part)) return "[^/]+"
      return escapeRegex(part)
    })
    .join("/")
  return new RegExp(`^${pattern}$`)
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function summarizeScopes(items) {
  const scopes = new Map()
  for (const item of items) {
    scopes.set(item.scope, (scopes.get(item.scope) || 0) + 1)
  }
  return Object.fromEntries([...scopes.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

function matchesRoute(probe, route) {
  return route.methods.includes(probe.method) && routePattern(route.route).test(probe.path)
}

function probeKey(probe) {
  return `${probe.method} ${probe.path}`
}

function main() {
  const businessRoutes = APP_CLIENT_CONTRACT_ROUTES.filter((route) => route.scope !== "health")
  const coveredRoutes = []
  const missingRoutes = []

  for (const route of businessRoutes) {
    const probes = COVERAGE_PROBES.filter((probe) => matchesRoute(probe, route))
    if (probes.length) {
      coveredRoutes.push({
        scope: route.scope,
        route: route.route,
        methods: route.methods,
        probes: probes.map(probeKey),
      })
      continue
    }
    missingRoutes.push({
      scope: route.scope,
      route: route.route,
      methods: route.methods,
    })
  }

  const unmatchedProbes = COVERAGE_PROBES.filter((probe) => !businessRoutes.some((route) => matchesRoute(probe, route))).map(
    (probe) => ({
      scope: probe.scope,
      method: probe.method,
      path: probe.path,
    }),
  )

  const result = {
    ok: missingRoutes.length === 0 && unmatchedProbes.length === 0,
    checkedRoutes: APP_CLIENT_CONTRACT_ROUTES.length,
    requiredRoutes: APP_CLIENT_CONTRACT_ROUTES.length - IMPLEMENTED_APP_FACADE_ROUTES.length,
    implementedFacadeRoutes: IMPLEMENTED_APP_FACADE_ROUTES.length,
    healthRoutesExcluded: APP_CLIENT_CONTRACT_ROUTES.length - businessRoutes.length,
    businessRoutes: businessRoutes.length,
    smokeProbes: PROBES.length,
    coverageOnlyProbes:
      IMPLEMENTED_APP_FACADE_COVERAGE_PROBES.length + NON_EXECUTED_MUTATION_COVERAGE_PROBES.length,
    coverageProbes: COVERAGE_PROBES.length,
    coveredBusinessRoutes: coveredRoutes.length,
    scopes: summarizeScopes(coveredRoutes),
    missingRoutes,
    unmatchedProbes,
  }

  console.log(JSON.stringify(result, null, 2))
  if (!result.ok) process.exit(1)
}

main()
