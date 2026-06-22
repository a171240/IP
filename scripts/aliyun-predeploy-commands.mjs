export const LOCAL_PREDEPLOY_COMMANDS = Object.freeze([
  Object.freeze(["run", "aliyun:env:check"]),
  Object.freeze(["run", "aliyun:env:plan"]),
  Object.freeze(["run", "aliyun:env:sources"]),
  Object.freeze(["run", "aliyun:env:classification:test"]),
  Object.freeze(["run", "aliyun:deploy:spec"]),
  Object.freeze(["run", "aliyun:runtime:plan"]),
  Object.freeze(["run", "aliyun:image:plan"]),
  Object.freeze(["run", "aliyun:legal:check"]),
  Object.freeze(["run", "aliyun:cloud:access"]),
  Object.freeze(["run", "aliyun:cloud:confirmations"]),
  Object.freeze(["run", "aliyun:domain:check"]),
  Object.freeze(["run", "aliyun:cloud:check"]),
  Object.freeze(["run", "aliyun:readiness"]),
  Object.freeze(["run", "aliyun:status"]),
  Object.freeze(["run", "aliyun:routes:check"]),
  Object.freeze(["run", "aliyun:app-api:bridge-map"]),
  Object.freeze(["run", "aliyun:app-client:contract"]),
  Object.freeze(["run", "aliyun:app-config:check"]),
  Object.freeze(["run", "aliyun:app-native:check"]),
  Object.freeze(["run", "aliyun:aasa:check"]),
  Object.freeze(["run", "aliyun:app-api:coverage"]),
  Object.freeze(["run", "aliyun:docker:check"]),
  Object.freeze(["exec", "tsc", "--noEmit", "--pretty", "false"]),
  Object.freeze(["run", "release:preflight"]),
  Object.freeze(["run", "build"]),
  Object.freeze(["run", "aliyun:health:smoke"]),
  Object.freeze(["run", "aliyun:app-api:smoke"]),
])

export function formatLocalPredeployCommand(args) {
  return `corepack pnpm ${args.join(" ")}`
}

export const LOCAL_PREDEPLOY_CHECKS = Object.freeze(
  LOCAL_PREDEPLOY_COMMANDS.map((args) => formatLocalPredeployCommand(args)),
)
