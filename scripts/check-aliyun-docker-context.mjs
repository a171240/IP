#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const REQUIRED_FILES = [
  "Dockerfile",
  ".dockerignore",
  "package.json",
  "pnpm-lock.yaml",
  "next.config.mjs",
  "app/api/app/health/route.ts",
  "app/api/healthz/route.ts",
]

const REQUIRED_DOCKERFILE_SNIPPETS = [
  "FROM node:24-bookworm-slim AS deps",
  "COPY package.json pnpm-lock.yaml ./",
  "RUN pnpm install --frozen-lockfile",
  "RUN pnpm build",
  "EXPOSE 3000",
  'CMD ["pnpm", "start"]',
]

const REQUIRED_DOCKERIGNORE_PATTERNS = [
  ".env",
  ".env.*",
  "node_modules",
  ".next",
  ".vercel",
  "*.log",
  "*.tsbuildinfo",
  ".claude",
  "/tmp-*",
  "/li-ke-*.png",
]

function readText(file) {
  return readFileSync(resolve(process.cwd(), file), "utf8")
}

function assertExists(file) {
  if (!existsSync(resolve(process.cwd(), file))) {
    throw new Error(`missing_required_file:${file}`)
  }
}

function assertIncludes(name, source, snippet) {
  if (!source.includes(snippet)) throw new Error(`missing_${name}:${snippet}`)
}

function dockerignorePatterns(source) {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
}

function assertDockerignore() {
  const source = readText(".dockerignore")
  const patterns = dockerignorePatterns(source)
  for (const required of REQUIRED_DOCKERIGNORE_PATTERNS) {
    if (!patterns.includes(required)) throw new Error(`missing_dockerignore_pattern:${required}`)
  }
  for (const unsafe of ["!.env", "!.env.*", "!.env.production-cn.local"]) {
    if (patterns.includes(unsafe)) throw new Error(`unsafe_dockerignore_unignore:${unsafe}`)
  }
  return patterns
}

function assertPackageScripts() {
  const pkg = JSON.parse(readText("package.json"))
  const scripts = pkg.scripts || {}
  if (!scripts["aliyun:docker:build"]) throw new Error("missing_package_script:aliyun:docker:build")
  if (!scripts["aliyun:predeploy"]) throw new Error("missing_package_script:aliyun:predeploy")
}

function main() {
  for (const file of REQUIRED_FILES) assertExists(file)

  const dockerfile = readText("Dockerfile")
  for (const snippet of REQUIRED_DOCKERFILE_SNIPPETS) {
    assertIncludes("dockerfile_snippet", dockerfile, snippet)
  }

  const dockerignore = assertDockerignore()
  assertPackageScripts()

  console.log(JSON.stringify({
    ok: true,
    checkedFiles: REQUIRED_FILES.length,
    dockerignorePatterns: dockerignore.length,
    dockerfileSnippets: REQUIRED_DOCKERFILE_SNIPPETS.length,
    sensitiveEnvExcluded: true,
  }, null, 2))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
