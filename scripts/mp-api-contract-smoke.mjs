#!/usr/bin/env node

const DEFAULT_BASE_URL = "https://ip.ipgongchang.xin"

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/, "")
}

function parseArgs(argv) {
  const out = {
    baseUrl: process.env.MP_API_BASE_URL || process.env.MP_BASE_URL || DEFAULT_BASE_URL,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--base-url" && argv[i + 1]) {
      out.baseUrl = argv[i + 1]
      i += 1
    } else if (!arg.startsWith("--")) {
      out.baseUrl = arg
    }
  }

  out.baseUrl = normalizeBaseUrl(out.baseUrl)
  return out
}

const CONTRACTS = [
  {
    name: "profile auth gate",
    method: "GET",
    path: "/api/mp/profile",
    expectedStatus: [401],
    authGate: true,
  },
  {
    name: "virtual pay products",
    method: "GET",
    path: "/api/mp/virtual-pay/products",
    expectedStatus: [200],
    validate(data) {
      return Array.isArray(data?.products) && data.products.length > 0
    },
  },
  {
    name: "service record sessions auth gate",
    method: "GET",
    path: "/api/mp/service-records/sessions",
    expectedStatus: [401],
    authGate: true,
  },
  {
    name: "private copy drafts auth gate",
    method: "GET",
    path: "/api/mp/private-copy/drafts?module=moment_post&limit=1",
    expectedStatus: [401],
    authGate: true,
  },
  {
    name: "private copy generate auth gate",
    method: "POST",
    path: "/api/mp/private-copy/generate",
    body: {
      module: "moment_post",
      scene: "general_moment",
      channel: "moments",
      input: {
        topic: "hydration care reminder",
        tone: "warm",
      },
    },
    expectedStatus: [401],
    authGate: true,
  },
  {
    name: "xhs drafts auth gate",
    method: "GET",
    path: "/api/mp/xhs/drafts?limit=1",
    expectedStatus: [401],
    authGate: true,
  },
  {
    name: "xhs generate auth gate",
    method: "POST",
    path: "/api/mp/xhs/generate-v4",
    body: {
      contentType: "education",
      topic: "hydration care reminder",
      keywords: "beauty,care",
    },
    expectedStatus: [401],
    authGate: true,
  },
  {
    name: "store profiles auth gate",
    method: "GET",
    path: "/api/mp/store-profiles?limit=1",
    expectedStatus: [401],
    authGate: true,
  },
  {
    name: "poster templates public route",
    method: "GET",
    path: "/api/mp/posters/templates",
    expectedStatus: [200],
  },
  {
    name: "knowledge spaces auth gate",
    method: "GET",
    path: "/api/mp/knowledge-spaces/options",
    expectedStatus: [401],
    authGate: true,
  },
  {
    name: "voice training home auth gate",
    method: "GET",
    path: "/api/mp/voice-coach/training-home?training_pack_mode=common-generic",
    expectedStatus: [401],
    authGate: true,
  },
  {
    name: "workbench auth gate",
    method: "GET",
    path: "/api/mp/workbench",
    expectedStatus: [401],
    authGate: true,
  },
]

function tryParseJson(text) {
  try {
    return JSON.parse(text)
  } catch (_) {
    return null
  }
}

function shortText(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim()
  return text.length > 160 ? `${text.slice(0, 160)}...` : text
}

async function runContract(baseUrl, contract) {
  const url = `${baseUrl}${contract.path}`
  const headers = {}
  const init = { method: contract.method, headers }

  if (contract.body) {
    headers["Content-Type"] = "application/json"
    init.body = JSON.stringify(contract.body)
  }

  const started = Date.now()
  const res = await fetch(url, init)
  const text = await res.text()
  const data = tryParseJson(text)
  const elapsed = Date.now() - started
  const expectedStatuses = contract.expectedStatus || []

  if (!expectedStatuses.includes(res.status)) {
    throw new Error(`expected HTTP ${expectedStatuses.join("/")} got ${res.status}; body=${shortText(text)}`)
  }

  if (res.status === 404) {
    throw new Error(`route missing: ${contract.path}`)
  }

  if (contract.authGate) {
    const authText = [data?.code, data?.error, data?.message].filter(Boolean).join(" ")
    if (!authText.includes("auth_required") && !authText.includes("请先登录") && !authText.toLowerCase().includes("login")) {
      throw new Error(`expected auth gate response; body=${shortText(text)}`)
    }
  } else if (contract.expectedCode && data?.code !== contract.expectedCode) {
    throw new Error(`expected code ${contract.expectedCode} got ${data?.code || "none"}; body=${shortText(text)}`)
  }

  if (contract.validate && !contract.validate(data, text)) {
    throw new Error(`response validation failed; body=${shortText(text)}`)
  }

  return { status: res.status, elapsed }
}

async function main() {
  const { baseUrl } = parseArgs(process.argv.slice(2))
  const failures = []

  console.log(`mp-api-contract-smoke base=${baseUrl}`)

  for (const contract of CONTRACTS) {
    try {
      const result = await runContract(baseUrl, contract)
      console.log(`PASS ${contract.method} ${contract.path} -> ${result.status} ${contract.name} ${result.elapsed}ms`)
    } catch (error) {
      failures.push({ contract, error })
      console.error(`FAIL ${contract.method} ${contract.path} ${contract.name}: ${error?.message || error}`)
    }
  }

  if (failures.length) {
    console.error(`mp-api-contract-smoke failed: ${failures.length}/${CONTRACTS.length}`)
    process.exit(1)
  }

  console.log(`mp-api-contract-smoke passed: ${CONTRACTS.length}/${CONTRACTS.length}`)
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error)
  process.exit(1)
})
