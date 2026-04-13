import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const ci = require("miniprogram-ci")

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")
const cliScriptPath = path.resolve(__dirname, "wechat-devtools-cli.mjs")

function getArg(name) {
  const index = process.argv.indexOf(name)
  if (index === -1) return ""
  return String(process.argv[index + 1] || "").trim()
}

function hasFlag(name) {
  return process.argv.includes(name)
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"))
}

function resolveProjectPath() {
  const configured = String(process.env.WECHAT_MINIPROGRAM_PROJECT_PATH || "mini-program-ui").trim()
  return path.resolve(repoRoot, configured)
}

function resolveAppId(projectPath) {
  const direct = String(process.env.WECHAT_MINIPROGRAM_APPID || "").trim()
  if (direct) return direct
  const projectConfigPath = path.join(projectPath, "project.config.json")
  const projectConfig = readJson(projectConfigPath)
  return String(projectConfig.appid || "").trim()
}

function resolveVersion() {
  const fromArg = getArg("--version")
  if (fromArg) return fromArg
  const fromEnv = String(process.env.WECHAT_MINIPROGRAM_VERSION || "").trim()
  if (fromEnv) return fromEnv
  const pkg = readJson(path.join(repoRoot, "package.json"))
  return String(pkg.version || "0.1.0").trim()
}

function resolveDesc() {
  const fromArg = getArg("--desc")
  if (fromArg) return fromArg
  const fromEnv = String(process.env.WECHAT_MINIPROGRAM_DESC || "").trim()
  if (fromEnv) return fromEnv
  return `Codex upload ${new Date().toISOString()}`
}

function resolveRobot() {
  const fromArg = getArg("--robot")
  const value = fromArg || String(process.env.WECHAT_MINIPROGRAM_ROBOT || "").trim()
  const robot = Number(value || 1)
  return Number.isFinite(robot) ? robot : 1
}

async function uploadWithCi(projectPath, appid, version, desc, robot, privateKeyPath) {
  const project = new ci.Project({
    appid,
    type: "miniProgram",
    projectPath,
    privateKeyPath,
    ignores: ["node_modules/**/*"],
  })

  await ci.upload({
    project,
    version,
    desc,
    robot,
    setting: {
      es6: true,
      minifyJS: true,
      minifyWXML: true,
      minifyWXSS: true,
      autoPrefixWXSS: true,
    },
    onProgressUpdate(event) {
      if (!event) return
      const message = event._status || event.message || JSON.stringify(event)
      console.log(message)
    },
  })
}

function uploadWithDevTools(version, desc) {
  execFileSync(process.execPath, [cliScriptPath, "upload", "--version", version, "--desc", desc], {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  })
}

async function main() {
  const projectPath = resolveProjectPath()
  if (!fs.existsSync(projectPath)) {
    throw new Error(`Mini program project not found: ${projectPath}`)
  }

  const appid = resolveAppId(projectPath)
  if (!appid) {
    throw new Error("Missing mini program appid. Set WECHAT_MINIPROGRAM_APPID or project.config.json appid.")
  }

  const version = resolveVersion()
  const desc = resolveDesc()
  const robot = resolveRobot()
  const privateKeySetting = String(process.env.WECHAT_MINIPROGRAM_PRIVATE_KEY_PATH || "").trim()
  const privateKeyPath = privateKeySetting ? path.resolve(repoRoot, privateKeySetting) : ""

  const forceCi = hasFlag("--ci")
  const forceDevTools = hasFlag("--devtools")
  const canUseCi = !!privateKeySetting && fs.existsSync(privateKeyPath)

  if (forceCi && !canUseCi) {
    if (!privateKeySetting) {
      throw new Error("WECHAT_MINIPROGRAM_PRIVATE_KEY_PATH is required for --ci uploads.")
    }
    throw new Error(`WECHAT_MINIPROGRAM_PRIVATE_KEY_PATH not found: ${privateKeyPath}`)
  }

  if (!forceDevTools && (forceCi || canUseCi)) {
    console.log(`Uploading with miniprogram-ci. appid=${appid} version=${version}`)
    await uploadWithCi(projectPath, appid, version, desc, robot, privateKeyPath)
    return
  }

  console.log(`Uploading with WeChat DevTools CLI. appid=${appid} version=${version}`)
  uploadWithDevTools(version, desc)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
