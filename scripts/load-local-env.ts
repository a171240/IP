import fs from "fs"
import path from "path"

function parseEnvFile(content: string) {
  const env: Record<string, string> = {}
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue
    let key = trimmed.slice(0, eq).trim()
    if (key.startsWith("export ")) key = key.slice(7).trim()
    if (!key) continue
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

function candidateDirs(startDir: string) {
  const dirs = new Set<string>()
  let current = path.resolve(startDir)
  while (true) {
    dirs.add(current)
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  dirs.add("/Users/zhuan/IP项目/ip-content-factory")
  return Array.from(dirs)
}

export function loadLocalEnv(startDir = process.cwd()) {
  const loaded: string[] = []
  for (const dir of candidateDirs(startDir)) {
    for (const fileName of [".env.local", ".env"]) {
      const filePath = path.join(dir, fileName)
      if (!fs.existsSync(filePath)) continue
      const raw = fs.readFileSync(filePath, "utf8")
      const parsed = parseEnvFile(raw)
      let applied = false
      for (const [key, value] of Object.entries(parsed)) {
        if (process.env[key] != null && String(process.env[key]).trim()) continue
        process.env[key] = value
        applied = true
      }
      if (applied) loaded.push(filePath)
    }
  }
  return loaded
}
