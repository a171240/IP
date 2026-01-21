import { spawnSync } from "node:child_process"

const isProduction = process.env.NODE_ENV === "production"
const isStrictBuild = isProduction || process.env.NEXT_STRICT_BUILD !== "false"

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: "inherit", shell: true })
  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status)
  }
}

if (isStrictBuild) {
  run("npx", ["eslint", "."])
}

run("npx", ["next", "build"])
