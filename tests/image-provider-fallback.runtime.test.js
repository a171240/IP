const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const { mkdirSync, writeFileSync, mkdtempSync } = require("node:fs")
const { join } = require("node:path")
const { tmpdir } = require("node:os")

function compileProvider() {
  const root = process.cwd()
  const compiledDir = mkdtempSync(join(tmpdir(), "image-provider-fallback-"))
  execFileSync(
    process.execPath,
    [
      "./node_modules/typescript/bin/tsc",
      "lib/posters/gpt-image-2.server.ts",
      "--outDir",
      compiledDir,
      "--module",
      "commonjs",
      "--target",
      "es2022",
      "--esModuleInterop",
      "--skipLibCheck",
      "--moduleResolution",
      "node",
    ],
    { cwd: root, stdio: "pipe" }
  )
  const serverOnlyDir = join(compiledDir, "node_modules", "server-only")
  mkdirSync(serverOnlyDir, { recursive: true })
  writeFileSync(join(serverOnlyDir, "index.js"), "")
  return join(compiledDir, "gpt-image-2.server.js")
}

function setEnv(values) {
  const previous = {}
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key]
    if (value == null) delete process.env[key]
    else process.env[key] = value
  }
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test("image provider falls back to Evolink when APIMart task is aborted", async () => {
  const providerPath = compileProvider()
  const restoreEnv = setEnv({
    APIMART_IMAGE_API_KEY: "test-apimart-key",
    APIMART_IMAGE_BASE_URL: "https://apimart.test/v1",
    APIMART_IMAGE_MODEL: "gpt-image-2",
    APIMART_IMAGE_FALLBACK_MODELS: "",
    APIMART_IMAGE_OFFICIAL_FALLBACK: "",
    APIMART_IMAGE_REQUEST_TIMEOUT_MS: "30000",
    APIMART_IMAGE_POLL_TIMEOUT_MS: "30000",
    APIMART_IMAGE_MAX_RETRIES: "0",
    EVOLINK_IMAGE_API_KEY: "test-evolink-key",
    EVOLINK_IMAGE_BASE_URL: "https://evolink.test/v1",
    EVOLINK_IMAGE_MODEL: "gpt-image-2",
    EVOLINK_IMAGE_FALLBACK_MODELS: "",
    EVOLINK_IMAGE_PRIMARY: "",
    ALLOW_EVOLINK_IMAGE_PRIMARY: "",
    EVOLINK_IMAGE_REQUEST_TIMEOUT_MS: "30000",
    EVOLINK_IMAGE_POLL_TIMEOUT_MS: "30000",
    EVOLINK_IMAGE_MAX_RETRIES: "0",
  })
  const originalFetch = global.fetch
  const originalSetTimeout = global.setTimeout
  const calls = []

  global.setTimeout = (fn, ms, ...args) => {
    if (ms === 9000 || ms === 3500 || ms === 1000) {
      return originalSetTimeout(fn, 0, ...args)
    }
    return originalSetTimeout(fn, ms, ...args)
  }
  global.fetch = async (url) => {
    const href = String(url)
    calls.push(href)
    if (href === "https://apimart.test/v1/images/generations") {
      return Response.json({ task_id: "task-aborted" })
    }
    if (href === "https://apimart.test/v1/tasks/task-aborted") {
      return Response.json({ status: "failed", message: "This operation was aborted" })
    }
    if (href === "https://evolink.test/v1/images/generations") {
      return Response.json({ data: { result: { images: [{ url: "https://cdn.test/fallback.png" }] } } })
    }
    throw new Error(`unexpected fetch ${href}`)
  }

  try {
    const { generateGptImage2 } = require(providerPath)
    const result = await generateGptImage2({
      prompt: "test prompt",
      size: "3:4",
      resolution: "1k",
    })

    assert.equal(result.model, "evolink:gpt-image-2")
    assert.equal(result.imageUrl, "https://cdn.test/fallback.png")
    assert.equal(result.fallbackUsed, true)
    assert.equal(result.failureCount, 1)
    assert.deepEqual(calls, [
      "https://apimart.test/v1/images/generations",
      "https://apimart.test/v1/tasks/task-aborted",
      "https://evolink.test/v1/images/generations",
    ])
  } finally {
    global.fetch = originalFetch
    global.setTimeout = originalSetTimeout
    restoreEnv()
  }
})

test("image provider falls back to Evolink when APIMart stays pending past fallback window", async () => {
  const providerPath = compileProvider()
  const restoreEnv = setEnv({
    APIMART_IMAGE_API_KEY: "test-apimart-key",
    APIMART_IMAGE_BASE_URL: "https://apimart.test/v1",
    APIMART_IMAGE_MODEL: "gpt-image-2",
    APIMART_IMAGE_FALLBACK_MODELS: "",
    APIMART_IMAGE_OFFICIAL_FALLBACK: "",
    APIMART_IMAGE_REQUEST_TIMEOUT_MS: "30000",
    APIMART_IMAGE_POLL_TIMEOUT_MS: "120000",
    APIMART_IMAGE_FALLBACK_AFTER_MS: "15000",
    APIMART_IMAGE_MAX_RETRIES: "0",
    EVOLINK_IMAGE_API_KEY: "test-evolink-key",
    EVOLINK_IMAGE_BASE_URL: "https://evolink.test/v1",
    EVOLINK_IMAGE_MODEL: "gpt-image-2",
    EVOLINK_IMAGE_FALLBACK_MODELS: "",
    EVOLINK_IMAGE_PRIMARY: "",
    ALLOW_EVOLINK_IMAGE_PRIMARY: "",
    EVOLINK_IMAGE_REQUEST_TIMEOUT_MS: "30000",
    EVOLINK_IMAGE_POLL_TIMEOUT_MS: "30000",
    EVOLINK_IMAGE_MAX_RETRIES: "0",
  })
  const originalFetch = global.fetch
  const originalSetTimeout = global.setTimeout
  const originalDateNow = Date.now
  const calls = []
  let now = 0

  Date.now = () => {
    now += 10000
    return now
  }
  global.setTimeout = (fn, ms, ...args) => {
    if (ms === 9000 || ms === 3500 || ms === 1000) {
      return originalSetTimeout(fn, 0, ...args)
    }
    return originalSetTimeout(fn, ms, ...args)
  }
  global.fetch = async (url) => {
    const href = String(url)
    calls.push(href)
    if (href === "https://apimart.test/v1/images/generations") {
      return Response.json({ task_id: "task-pending" })
    }
    if (href === "https://apimart.test/v1/tasks/task-pending") {
      return Response.json({ status: "processing" })
    }
    if (href === "https://evolink.test/v1/images/generations") {
      return Response.json({ data: { result: { images: [{ url: "https://cdn.test/fallback-pending.png" }] } } })
    }
    throw new Error(`unexpected fetch ${href}`)
  }

  try {
    const { generateGptImage2 } = require(providerPath)
    const result = await generateGptImage2({
      prompt: "test prompt",
      size: "3:4",
      resolution: "1k",
    })

    assert.equal(result.model, "evolink:gpt-image-2")
    assert.equal(result.imageUrl, "https://cdn.test/fallback-pending.png")
    assert.equal(result.fallbackUsed, true)
    assert.equal(result.failureCount, 1)
    assert.deepEqual(calls, [
      "https://apimart.test/v1/images/generations",
      "https://apimart.test/v1/tasks/task-pending",
      "https://evolink.test/v1/images/generations",
    ])
  } finally {
    global.fetch = originalFetch
    global.setTimeout = originalSetTimeout
    Date.now = originalDateNow
    restoreEnv()
  }
})
