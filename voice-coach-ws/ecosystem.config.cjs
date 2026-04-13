const fs = require("node:fs")
const { posix } = require("node:path")

const appHome = process.env.VOICE_COACH_WS_HOME || "/opt/ip-site/voice-coach-ws"
const logDir = process.env.VOICE_COACH_WS_LOG_DIR || "/var/log/voice-coach-ws"
const dotenvPath = process.env.DOTENV_CONFIG_PATH || posix.join(appHome, ".env.production")

function readEnvFile(filePath) {
  try {
    const text = fs.readFileSync(filePath, "utf8")
    const env = {}

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith("#")) continue
      const eqIndex = line.indexOf("=")
      if (eqIndex <= 0) continue
      const key = line.slice(0, eqIndex).trim()
      const value = line.slice(eqIndex + 1).trim()
      if (!key) continue
      env[key] = value
    }

    return env
  } catch {
    return {}
  }
}

const fileEnv = readEnvFile(dotenvPath)

module.exports = {
  apps: [
    {
      name: "voice-coach-ws",
      cwd: appHome,
      script: posix.join(appHome, "dist/main.js"),
      instances: 1,
      exec_mode: "fork",
      interpreter: "node",
      node_args: [`--env-file=${dotenvPath}`],
      env: {
        ...fileEnv,
        NODE_ENV: process.env.NODE_ENV || "production",
        WS_PORT: process.env.WS_PORT || "8080",
        DOTENV_CONFIG_PATH: dotenvPath,
      },
      max_memory_restart: "512M",
      min_uptime: "10s",
      max_restarts: 10,
      autorestart: true,
      watch: false,
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: posix.join(logDir, "error.log"),
      out_file: posix.join(logDir, "out.log"),
    },
  ],
}
