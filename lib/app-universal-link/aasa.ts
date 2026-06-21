export const EXPECTED_IOS_BUNDLE_ID = "com.ipgongchang.meiyehuajing"
export const UNIVERSAL_LINK_PATHS = ["/app/wechat/*", "/wechat/*"]

const APPLE_TEAM_ID_KEYS = ["APPLE_TEAM_ID", "IOS_TEAM_ID", "APP_IOS_TEAM_ID"]

export type AppleAppSiteAssociationConfig = {
  ready: boolean
  teamId: string
  bundleId: string
  paths: string[]
  missing: string[]
}

export type AppleAppSiteAssociationPayload = {
  applinks: {
    apps: []
    details: Array<{
      appID: string
      paths: string[]
    }>
  }
}

function readFirstEnv(env: NodeJS.ProcessEnv, keys: string[]) {
  for (const key of keys) {
    const value = String(env[key] || "").trim()
    if (value && !value.startsWith("TODO_")) return value
  }
  return ""
}

function normalizeTeamId(value: string) {
  return value.trim().toUpperCase()
}

export function resolveAppleAppSiteAssociationConfig(
  env: NodeJS.ProcessEnv = process.env,
): AppleAppSiteAssociationConfig {
  const teamId = normalizeTeamId(readFirstEnv(env, APPLE_TEAM_ID_KEYS))
  const bundleId = String(env.IOS_BUNDLE_ID || EXPECTED_IOS_BUNDLE_ID).trim()
  const missing: string[] = []

  if (!teamId) {
    missing.push("APPLE_TEAM_ID")
  } else if (!/^[A-Z0-9]{10}$/.test(teamId)) {
    missing.push("APPLE_TEAM_ID_FORMAT")
  }

  if (bundleId !== EXPECTED_IOS_BUNDLE_ID) {
    missing.push(`IOS_BUNDLE_ID=${EXPECTED_IOS_BUNDLE_ID}`)
  }

  return {
    ready: missing.length === 0,
    teamId,
    bundleId,
    paths: UNIVERSAL_LINK_PATHS,
    missing,
  }
}

export function buildAppleAppSiteAssociationPayload(
  config: AppleAppSiteAssociationConfig,
): AppleAppSiteAssociationPayload {
  if (!config.ready) {
    return {
      applinks: {
        apps: [],
        details: [],
      },
    }
  }

  return {
    applinks: {
      apps: [],
      details: [
        {
          appID: `${config.teamId}.${config.bundleId}`,
          paths: config.paths,
        },
      ],
    },
  }
}
