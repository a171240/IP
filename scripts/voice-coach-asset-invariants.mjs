#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const MIN_IMAGE_WIDTH = 800
const MIN_IMAGE_HEIGHT = 600

const requiredRoutes = [
  "app/api/mp/knowledge-spaces/options/route.ts",
  "app/api/mp/voice-coach/training-home/route.ts",
  "app/api/mp/voice-coach/training-progress/route.ts",
  "app/api/mp/voice-coach/training-sessions/[sessionId]/complete/route.ts",
  "app/api/mp/voice-coach/training-tasks/[taskId]/start/route.ts",
  "lib/voice-coach/training.server.ts",
]

const packs = [
  {
    file: "lib/voice-coach/training-packs/common-beauty-v2.json",
    expectedTasks: 30,
    expectedRefs: 30,
    label: "common-beauty/v2",
  },
  {
    file: "lib/voice-coach/training-packs/baibaitu-speaking-v2.json",
    expectedTasks: 30,
    expectedRefs: 90,
    expectedVisualCounts: { scene: 30, flow: 30, concept: 30 },
    label: "baibaitu-speaking/v2",
  },
]

const remoteSamples = [
  "/api/mp/knowledge-spaces/options",
  "/api/mp/voice-coach/training-home?training_pack_mode=common-generic",
  "/api/mp/voice-coach/training-home?training_pack_mode=baibaitu-speaking",
  "/voice-coach-assets/voice-coach/common-beauty/v2/d01/scene.jpg",
  "/voice-coach-assets/voice-coach/baibaitu-speaking/v2/s01/scene.jpg",
  "/voice-coach-assets/voice-coach/baibaitu-speaking/v2/s01/flow.jpg",
  "/voice-coach-assets/voice-coach/baibaitu-speaking/v2/s01/concept.jpg",
]

const results = []

function addResult(ok, message) {
  results.push({ ok, message })
  console.log(`${ok ? "PASS" : "FAIL"} ${message}`)
}

function absolutePath(relativePath) {
  return path.join(ROOT, relativePath)
}

function assertExists(relativePath) {
  addResult(fs.existsSync(absolutePath(relativePath)), `exists ${relativePath}`)
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(absolutePath(relativePath), "utf8"))
}

function collectAssetUrls(value, output = []) {
  if (typeof value === "string") {
    if (value.includes("/voice-coach-assets/")) output.push(value)
    return output
  }
  if (Array.isArray(value)) {
    for (const item of value) collectAssetUrls(item, output)
    return output
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectAssetUrls(item, output)
  }
  return output
}

function assetUrlToLocalPath(url) {
  const marker = "/voice-coach-assets/"
  const index = url.indexOf(marker)
  if (index < 0) return ""
  return path.join("public", url.slice(index))
}

function readJpegSize(relativePath) {
  const bytes = fs.readFileSync(absolutePath(relativePath))
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null

  let index = 2
  while (index + 9 < bytes.length) {
    if (bytes[index] !== 0xff) {
      index += 1
      continue
    }

    const marker = bytes[index + 1]
    const length = bytes.readUInt16BE(index + 2)
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)

    if (isSof) {
      return {
        width: bytes.readUInt16BE(index + 7),
        height: bytes.readUInt16BE(index + 5),
      }
    }

    index += 2 + length
  }

  return null
}

function getTaskVisualCounts(tasks) {
  return tasks.reduce(
    (counts, task) => {
      const context = task.training_context || {}
      if (context.visual_scene?.image || task.visual_scene?.image || task.visualScene?.image) counts.scene += 1
      if (context.learning_visuals?.flow?.image || task.learning_visuals?.flow?.image || task.learningVisuals?.flow?.image) {
        counts.flow += 1
      }
      if (
        context.learning_visuals?.concept?.image ||
        task.learning_visuals?.concept?.image ||
        task.learningVisuals?.concept?.image
      ) {
        counts.concept += 1
      }
      return counts
    },
    { scene: 0, flow: 0, concept: 0 },
  )
}

function checkPack(pack) {
  const json = readJson(pack.file)
  const tasks = Array.isArray(json.tasks) ? json.tasks : []
  const refs = [...new Set(collectAssetUrls(json).map(assetUrlToLocalPath).filter(Boolean))]
  const missing = refs.filter((relativePath) => !fs.existsSync(absolutePath(relativePath)))
  const wrongVersion = refs.filter((relativePath) => !relativePath.includes(pack.label))
  const lowResolution = refs
    .map((relativePath) => ({ relativePath, size: readJpegSize(relativePath) }))
    .filter(
      (item) =>
        !item.size || item.size.width < MIN_IMAGE_WIDTH || item.size.height < MIN_IMAGE_HEIGHT,
    )

  addResult(tasks.length === pack.expectedTasks, `${pack.label} task count ${tasks.length}/${pack.expectedTasks}`)
  addResult(refs.length === pack.expectedRefs, `${pack.label} asset refs ${refs.length}/${pack.expectedRefs}`)
  addResult(wrongVersion.length === 0, `${pack.label} wrong-version refs ${wrongVersion.length}`)
  addResult(missing.length === 0, `${pack.label} missing local assets ${missing.length}`)
  addResult(lowResolution.length === 0, `${pack.label} low-res assets ${lowResolution.length}`)

  if (pack.expectedVisualCounts) {
    const counts = getTaskVisualCounts(tasks)
    for (const [key, expected] of Object.entries(pack.expectedVisualCounts)) {
      addResult(counts[key] === expected, `${pack.label} ${key} images ${counts[key]}/${expected}`)
    }
  }
}

function walkFiles(relativeDir, output = []) {
  const dir = absolutePath(relativeDir)
  if (!fs.existsSync(dir)) return output
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name)
    if (entry.isDirectory()) walkFiles(relativePath, output)
    else output.push(relativePath)
  }
  return output
}

function checkPublicAssets() {
  const files = walkFiles("public/voice-coach-assets")
  const lowResolution = files
    .map((relativePath) => ({ relativePath, size: readJpegSize(relativePath) }))
    .filter(
      (item) =>
        !item.size || item.size.width < MIN_IMAGE_WIDTH || item.size.height < MIN_IMAGE_HEIGHT,
    )

  addResult(files.length >= 120, `public voice-coach assets ${files.length}`)
  addResult(lowResolution.length === 0, `public voice-coach low-res assets ${lowResolution.length}`)
}

function parseBaseUrl() {
  const argIndex = process.argv.indexOf("--base-url")
  const cliValue = argIndex >= 0 ? process.argv[argIndex + 1] : ""
  return String(cliValue || process.env.VOICE_COACH_INVARIANT_BASE_URL || "").replace(/\/+$/, "")
}

async function checkRemote(baseUrl) {
  for (const samplePath of remoteSamples) {
    const url = `${baseUrl}${samplePath}`
    try {
      const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10000) })
      if (samplePath.includes("/voice-coach-assets/")) {
        const contentType = response.headers.get("content-type") || ""
        addResult(response.status === 200 && contentType.includes("image/"), `remote asset ${samplePath} -> ${response.status}`)
      } else {
        const allowedApiStatuses = new Set([200, 400, 401, 403])
        addResult(allowedApiStatuses.has(response.status), `remote api ${samplePath} -> ${response.status}`)
      }
    } catch (error) {
      addResult(false, `remote ${samplePath} -> ${error.message}`)
    }
  }
}

for (const route of requiredRoutes) assertExists(route)
for (const pack of packs) checkPack(pack)
checkPublicAssets()

const baseUrl = parseBaseUrl()
if (baseUrl) await checkRemote(baseUrl)

const failed = results.filter((result) => !result.ok)
if (failed.length) {
  console.error(`VoiceCoach asset invariant failed: ${failed.length} issue(s).`)
  process.exit(1)
}

console.log(`VoiceCoach asset invariant passed: ${results.length} check(s).`)
