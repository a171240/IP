import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { extname, join } from "node:path"

const checks = []

function addCheck(name, run) {
  checks.push({ name, run })
}

function fail(message) {
  throw new Error(message)
}

function assertFile(path, opts = {}) {
  if (!existsSync(path)) fail(`missing file: ${path}`)
  const stat = statSync(path)
  if (!stat.isFile()) fail(`not a file: ${path}`)
  if (opts.minBytes && stat.size < opts.minBytes) {
    fail(`file too small: ${path} (${stat.size} bytes, expected >= ${opts.minBytes})`)
  }
}

function assertDir(path) {
  if (!existsSync(path)) fail(`missing directory: ${path}`)
  if (!statSync(path).isDirectory()) fail(`not a directory: ${path}`)
}

function countFiles(path) {
  let total = 0
  for (const entry of readdirSync(path)) {
    const fullPath = join(path, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      total += countFiles(fullPath)
    } else if (stat.isFile()) {
      total += 1
    }
  }
  return total
}

function assertImageFile(path) {
  const ext = extname(path).toLowerCase()
  if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
    fail(`representative asset is not an image extension: ${path}`)
  }
  assertFile(path, { minBytes: 1024 })
}

function assertRequiredProfessionalAssets() {
  const manifestPath = "scripts/required-professional-learning-rendered-assets.json"
  assertFile(manifestPath, { minBytes: 1024 })

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  const assets = Array.isArray(manifest.assets) ? manifest.assets : []
  if (assets.length < 397) {
    fail(`too few required professional-learning rendered assets: ${assets.length}, expected at least 397`)
  }
  if (manifest.asset_count !== assets.length) {
    fail(`professional-learning required asset count mismatch: manifest=${manifest.asset_count}, actual=${assets.length}`)
  }

  const seen = new Set()
  assets.forEach((asset, index) => {
    const publicPath = asset && asset.public_path
    if (typeof publicPath !== "string" || !publicPath.startsWith("public/professional-learning-assets/")) {
      fail(`invalid professional-learning required asset path at index ${index}: ${publicPath}`)
    }
    if (seen.has(publicPath)) fail(`duplicate professional-learning required asset path: ${publicPath}`)
    seen.add(publicPath)
    assertImageFile(publicPath)
  })
}

addCheck("private-copy API routes are in the backend package", () => {
  ;[
    "app/api/mp/private-copy/drafts/route.ts",
    "app/api/mp/private-copy/drafts/[draftId]/route.ts",
    "app/api/mp/private-copy/generate/route.ts",
  ].forEach((path) => assertFile(path, { minBytes: 1024 }))
})

addCheck("voice-coach static assets are in the backend package", () => {
  const root = "public/voice-coach-assets"
  assertDir(root)
  const fileCount = countFiles(root)
  if (fileCount < 120) fail(`too few voice-coach assets: ${fileCount}, expected at least 120`)
  ;[
    "public/voice-coach-assets/voice-coach/common-beauty/v2/d01/scene.jpg",
    "public/voice-coach-assets/voice-coach/baibaitu-speaking/v2/s08/flow.jpg",
  ].forEach(assertImageFile)
})

addCheck("professional-learning static assets are in the backend package", () => {
  const root = "public/professional-learning-assets"
  assertDir(root)
  const fileCount = countFiles(root)
  if (fileCount < 397) fail(`too few professional-learning assets: ${fileCount}, expected at least 397`)
  assertRequiredProfessionalAssets()
  ;[
    "public/professional-learning-assets/professional-learning/v2/skin-layers/01-main.jpg",
    "public/professional-learning-assets/professional-learning/v3-imagegen/tcm-yinyang-foundation/pages/02-yinyang-state-translation.jpg",
    "public/professional-learning-assets/professional-learning/v3-imagegen-reference/liver-organ-expression/pages/01-soothing-flow-candidate-c-customer-entry.jpg",
  ].forEach(assertImageFile)
})

addCheck("backend app package is not a static-only deploy folder", () => {
  assertFile("package.json", { minBytes: 1024 })
  assertDir("app/api/mp")
  assertDir("lib")
  assertDir("public")
})

let failures = 0
for (const check of checks) {
  try {
    check.run()
    console.log(`PASS ${check.name}`)
  } catch (error) {
    failures += 1
    const message = error instanceof Error ? error.message : String(error)
    console.error(`FAIL ${check.name}: ${message}`)
  }
}

if (failures) {
  console.error(`backend release package check failed: ${failures}/${checks.length}`)
  process.exit(1)
}

console.log(`backend release package check passed: ${checks.length}/${checks.length}`)
