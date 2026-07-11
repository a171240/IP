import "server-only"

export const APP_VOICE_COACH_TEXT_REPOSITORY_MODE_ENV =
  "APP_VOICE_COACH_TEXT_REPOSITORY_MODE"
export const APP_VOICE_COACH_LOCAL_DURABLE_REPOSITORY_MODE = "local_durable"
export const APP_VOICE_COACH_LEGACY_RDS_REPOSITORY_MODE = "rds"
export const APP_VOICE_COACH_PRODUCTION_RDS_REPOSITORY_MODE =
  "rds_voice_coach_text_session_contract"
export const APP_VOICE_COACH_REPOSITORY_NOT_CONFIGURED_CODE =
  "voice_coach_repository_not_configured"

export type AppVoiceCoachTextRepositorySelection = "local_durable" | "rds"

export class AppVoiceCoachRepositoryConfigurationError extends Error {
  readonly code = APP_VOICE_COACH_REPOSITORY_NOT_CONFIGURED_CODE

  constructor() {
    super(APP_VOICE_COACH_REPOSITORY_NOT_CONFIGURED_CODE)
    this.name = "AppVoiceCoachRepositoryConfigurationError"
  }
}

export function isAppVoiceCoachProductionCnRuntime(
  env: NodeJS.ProcessEnv = process.env,
) {
  return (
    cleanRuntimeValue(env.APP_ENV) === "production-cn" ||
    cleanRuntimeValue(env.APP_REGION) === "cn-hangzhou"
  )
}

export function isAppVoiceCoachProductionRepositoryModeConfigured(
  env: NodeJS.ProcessEnv = process.env,
) {
  return (
    cleanRuntimeValue(env[APP_VOICE_COACH_TEXT_REPOSITORY_MODE_ENV]) ===
    APP_VOICE_COACH_PRODUCTION_RDS_REPOSITORY_MODE
  )
}

export function resolveAppVoiceCoachTextRepositorySelection(
  env: NodeJS.ProcessEnv = process.env,
): AppVoiceCoachTextRepositorySelection {
  const configuredMode = cleanRuntimeValue(
    env[APP_VOICE_COACH_TEXT_REPOSITORY_MODE_ENV],
  )

  if (isAppVoiceCoachProductionCnRuntime(env)) {
    if (configuredMode === APP_VOICE_COACH_PRODUCTION_RDS_REPOSITORY_MODE) {
      return "rds"
    }
    throw new AppVoiceCoachRepositoryConfigurationError()
  }

  if (
    !configuredMode ||
    configuredMode === APP_VOICE_COACH_LOCAL_DURABLE_REPOSITORY_MODE
  ) {
    return "local_durable"
  }
  if (
    configuredMode === APP_VOICE_COACH_LEGACY_RDS_REPOSITORY_MODE ||
    configuredMode === APP_VOICE_COACH_PRODUCTION_RDS_REPOSITORY_MODE
  ) {
    return "rds"
  }
  throw new AppVoiceCoachRepositoryConfigurationError()
}

function cleanRuntimeValue(value: unknown) {
  return String(value || "").trim()
}
