import fs from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")

const CLI_ENV_KEYS = ["WECHAT_DEVTOOLS_CLI", "WECHAT_WEB_DEVTOOLS_CLI"]
const CLI_CANDIDATES = [
  "D:\\\u5fae\u4fe1\u5f00\u53d1\u5de5\u5177\\\u5fae\u4fe1web\u5f00\u53d1\u8005\u5de5\u5177\\cli.bat",
  "C:\\Program Files (x86)\\Tencent\\\u5fae\u4fe1web\u5f00\u53d1\u8005\u5de5\u5177\\cli.bat",
  "C:\\Program Files\\Tencent\\\u5fae\u4fe1web\u5f00\u53d1\u8005\u5de5\u5177\\cli.bat",
]

const COMMANDS_WITH_PROJECT = new Set(["open", "preview", "auto-preview", "upload", "build-npm", "close"])
const COMMANDS_NEED_BOOTSTRAP = new Set(["islogin", "upload", "preview", "auto-preview", "build-npm"])
const COMMANDS_NEED_AUTO_CONFIRM = new Set(["open", "login"])

function findCliPath() {
  for (const key of CLI_ENV_KEYS) {
    const value = String(process.env[key] || "").trim()
    if (value && fs.existsSync(value)) return value
  }
  for (const candidate of CLI_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate
  }
  return ""
}

function resolveProjectPath() {
  const configured = String(process.env.WECHAT_MINIPROGRAM_PROJECT_PATH || "mini-program-ui").trim()
  return path.resolve(repoRoot, configured)
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"))
}

function projectNeedsNpmBuild(projectPath) {
  const packageJsonPath = path.join(projectPath, "package.json")
  if (fs.existsSync(packageJsonPath)) return true

  const projectConfigPath = path.join(projectPath, "project.config.json")
  if (!fs.existsSync(projectConfigPath)) return false

  try {
    const projectConfig = readJson(projectConfigPath)
    const relationList = projectConfig?.setting?.packNpmRelationList
    return Array.isArray(relationList) && relationList.length > 0
  } catch {
    return false
  }
}

function resolvePackageJson(cliPath) {
  const installDir = path.dirname(cliPath)
  const candidates = [
    path.join(installDir, "code", "package.nw", "package.json"),
    path.join(installDir, "package.json"),
  ]
  return candidates.find((candidate) => fs.existsSync(candidate)) || ""
}

function resolveDefaultProfileDir(cliPath) {
  const userProfile = String(process.env.USERPROFILE || "").trim()
  if (!userProfile) return ""

  const packageJsonPath = resolvePackageJson(cliPath)
  if (!packageJsonPath) return ""

  let productName = ""
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))
    productName = String(pkg.name || "").trim()
  } catch {
    return ""
  }
  if (!productName) return ""

  const userDataRoot = path.join(userProfile, "AppData", "Local", productName, "User Data")
  if (!fs.existsSync(userDataRoot)) return ""

  const hashDirs = fs
    .readdirSync(userDataRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(userDataRoot, entry.name))
    .sort((left, right) => {
      const leftTime = fs.statSync(left).mtimeMs
      const rightTime = fs.statSync(right).mtimeMs
      return rightTime - leftTime
    })

  if (!hashDirs.length) return ""
  return path.join(hashDirs[0], "Default")
}

function writeIdeServiceState(cliPath, idePort) {
  if (!idePort) return
  const defaultProfileDir = resolveDefaultProfileDir(cliPath)
  if (!defaultProfileDir) return

  fs.mkdirSync(defaultProfileDir, { recursive: true })
  fs.writeFileSync(path.join(defaultProfileDir, ".ide-status"), "On", "ascii")
  fs.writeFileSync(path.join(defaultProfileDir, ".ide"), String(idePort), "ascii")
}

function buildCliArgs(command, extraArgs) {
  const args = [command, "--lang", "zh"]

  if (COMMANDS_WITH_PROJECT.has(command)) {
    const projectPath = resolveProjectPath()
    if (!fs.existsSync(projectPath)) {
      throw new Error(`Mini program project not found: ${projectPath}`)
    }
    args.push("--project", projectPath)
  }

  args.push(...extraArgs)
  return args
}

function quoteForPowerShell(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function detectIdePort(output) {
  const matches = [...String(output || "").matchAll(/http:\/\/127\.0\.0\.1:(\d+)/g)]
  if (!matches.length) return 0
  return Number.parseInt(matches[matches.length - 1][1], 10) || 0
}

function runCliCommand(cliPath, args, { autoConfirm = false } = {}) {
  return new Promise((resolve, reject) => {
    const cliInvocation = `& ${quoteForPowerShell(cliPath)} ${args.map(quoteForPowerShell).join(" ")}`
    const psCommand = autoConfirm ? `'y' | ${cliInvocation}` : cliInvocation

    const child = spawn("powershell.exe", ["-NoProfile", "-Command", psCommand], {
      cwd: repoRoot,
      env: process.env,
      stdio: ["inherit", "pipe", "pipe"],
    })

    let combinedOutput = ""

    const pipeOutput = (stream, writer) => {
      stream.on("data", (chunk) => {
        const text = chunk.toString()
        combinedOutput += text
        writer.write(text)
      })
    }

    pipeOutput(child.stdout, process.stdout)
    pipeOutput(child.stderr, process.stderr)

    child.on("error", reject)

    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`WeChat DevTools CLI exited with signal ${signal}`))
        return
      }
      resolve({
        exitCode: code ?? 1,
        detectedIdePort: detectIdePort(combinedOutput),
      })
    })
  })
}

async function bootstrapIde(cliPath, extraArgs) {
  const bootstrapArgs = buildCliArgs("open", extraArgs)
  const result = await runCliCommand(cliPath, bootstrapArgs, { autoConfirm: true })
  if (result.detectedIdePort) {
    writeIdeServiceState(cliPath, result.detectedIdePort)
  }
  if (result.exitCode !== 0) {
    process.exit(result.exitCode)
  }
}

async function main() {
  const [command = "open", ...extraArgs] = process.argv.slice(2)
  const cliPath = findCliPath()
  const projectPath = resolveProjectPath()

  if (!cliPath) {
    console.error("WeChat DevTools CLI not found. Set WECHAT_DEVTOOLS_CLI to cli.bat.")
    process.exit(1)
  }

  if (command === "build-npm" && !projectNeedsNpmBuild(projectPath)) {
    console.log(`Skipping build-npm: project does not declare npm packages. (${projectPath})`)
    process.exit(0)
  }

  if (COMMANDS_NEED_BOOTSTRAP.has(command)) {
    await bootstrapIde(cliPath, extraArgs.includes("--debug") ? ["--debug"] : [])
  }

  const args = buildCliArgs(command, extraArgs)
  const autoConfirm = COMMANDS_NEED_AUTO_CONFIRM.has(command)
  const result = await runCliCommand(cliPath, args, { autoConfirm })
  if (result.detectedIdePort) {
    writeIdeServiceState(cliPath, result.detectedIdePort)
  }
  process.exit(result.exitCode)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
