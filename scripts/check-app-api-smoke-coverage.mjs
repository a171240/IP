#!/usr/bin/env node

import { REQUIRED_ROUTES } from "./check-app-api-production-cn-routes.mjs"
import { PROBES } from "./smoke-app-api-production-cn.mjs"

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
  const businessRoutes = REQUIRED_ROUTES.filter((route) => route.scope !== "health")
  const coveredRoutes = []
  const missingRoutes = []

  for (const route of businessRoutes) {
    const probes = PROBES.filter((probe) => matchesRoute(probe, route))
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

  const unmatchedProbes = PROBES.filter((probe) => !businessRoutes.some((route) => matchesRoute(probe, route))).map(
    (probe) => ({
      scope: probe.scope,
      method: probe.method,
      path: probe.path,
    }),
  )

  const result = {
    ok: missingRoutes.length === 0 && unmatchedProbes.length === 0,
    checkedRoutes: REQUIRED_ROUTES.length,
    healthRoutesExcluded: REQUIRED_ROUTES.length - businessRoutes.length,
    businessRoutes: businessRoutes.length,
    smokeProbes: PROBES.length,
    coveredBusinessRoutes: coveredRoutes.length,
    scopes: summarizeScopes(coveredRoutes),
    missingRoutes,
    unmatchedProbes,
  }

  console.log(JSON.stringify(result, null, 2))
  if (!result.ok) process.exit(1)
}

main()
