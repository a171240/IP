#!/usr/bin/env node

import { spawn } from "node:child_process"

const COMMANDS = [
  ["run", "aliyun:env:check"],
  ["run", "aliyun:readiness"],
  ["run", "aliyun:routes:check"],
  ["run", "aliyun:docker:check"],
  ["exec", "tsc", "--noEmit", "--pretty", "false"],
  ["run", "release:preflight"],
  ["run", "build"],
  ["run", "aliyun:health:smoke"],
  ["run", "aliyun:app-api:smoke"],
]

function resolvePnpmInvocation(args) {
  if (process.env.npm_execpath) {
    return {
      command: process.execPath,
      args: [process.env.npm_execpath, ...args],
    }
  }
  return {
    command: "corepack",
    args: ["pnpm", ...args],
  }
}

async function runStep(args) {
  const invocation = resolvePnpmInvocation(args)
  console.log(`\n[aliyun:predeploy] pnpm ${args.join(" ")}`)
  const child = spawn(invocation.command, invocation.args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  })
  const code = await new Promise((resolve) => child.once("exit", resolve))
  if (code !== 0) {
    throw new Error(`predeploy_step_failed:${args.join(" ")}:${code}`)
  }
}

for (const command of COMMANDS) {
  await runStep(command)
}

console.log("\n[aliyun:predeploy] passed")
