import { spawn } from "node:child_process"
import { resolve } from "node:path"
import { createInterface } from "node:readline"

const isProduction = process.env.NODE_ENV === "production"
const isStrictBuild = isProduction || process.env.NEXT_STRICT_BUILD !== "false"

const env = {
  ...process.env,
  BASELINE_BROWSER_MAPPING_IGNORE_OLD_DATA: "true",
  BROWSERSLIST_IGNORE_OLD_DATA: "true",
}

const eslintBin = resolve("node_modules", "eslint", "bin", "eslint.js")
const nextBin = resolve("node_modules", "next", "dist", "bin", "next")

const shouldFilter = (line) => line.includes("[baseline-browser-mapping]")

const pipeOutput = (stream, writer) => {
  const rl = createInterface({ input: stream, crlfDelay: Infinity })
  rl.on("line", (line) => {
    if (shouldFilter(line)) return
    writer.write(`${line}\n`)
  })
  stream.on("end", () => rl.close())
}

const run = (command, args) =>
  new Promise((resolveRun) => {
    const child = spawn(command, args, { env })
    if (child.stdout) pipeOutput(child.stdout, process.stdout)
    if (child.stderr) pipeOutput(child.stderr, process.stderr)
    child.on("error", (error) => {
      console.error(error)
      process.exit(1)
    })
    child.on("close", (code) => {
      if (typeof code === "number" && code !== 0) {
        process.exit(code)
      }
      resolveRun()
    })
  })

if (isStrictBuild) {
  await run(process.execPath, [eslintBin, "."])
}

await run(process.execPath, [nextBin, "build"])
