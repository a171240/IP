/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const { spawn } = require("node:child_process")
const fs = require("node:fs")
const http = require("node:http")
const path = require("node:path")

const root = process.cwd()
const script = path.join(root, "scripts", "check-app-api-online-readonly-boundary.mjs")
const postdeployCommand = "corepack pnpm aliyun:app-api:online-readonly-boundary -- --base-url https://api-cn.ipgongchang.xin --timeout-ms 15000"

function read(...parts) {
  return fs.readFileSync(path.join(root, ...parts), "utf8")
}

function readJson(...parts) {
  return JSON.parse(read(...parts))
}

function runAsync(baseUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, "--base-url", baseUrl, "--timeout-ms", "3000"], {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
      },
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk)
    })
    child.once("error", reject)
    child.once("exit", (status) => {
      resolve({
        status,
        stdout,
        stderr,
        report: JSON.parse(stdout || stderr),
      })
    })
  })
}

function createStubServer(handler) {
  const requests = []
  const server = http.createServer((request, response) => {
    const chunks = []
    request.on("data", (chunk) => chunks.push(chunk))
    request.on("end", () => {
      requests.push({
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization || "",
        liveSmoke: request.headers["x-app-live-smoke"],
        bodyLength: Buffer.concat(chunks).length,
      })
      handler(request, response)
    })
  })

  return new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (!address || typeof address === "string") {
        reject(new Error("missing_stub_server_port"))
        return
      }
      resolve({
        server,
        requests,
        baseUrl: `http://127.0.0.1:${address.port}`,
      })
    })
  })
}

function closeServer(server) {
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) rejectClose(error)
      else resolveClose()
    })
  })
}

test("online readonly boundary checker sends GET-only unauthenticated probes", async () => {
  const stub = await createStubServer((request, response) => {
    const status = request.url.includes("/api/health") || request.url.includes("/api/healthz") ? 200 : 401
    response.writeHead(status, { "content-type": "application/json" })
    response.end(JSON.stringify(status === 200 ? { ok: true } : { code: "auth_required" }))
  })

  try {
    const result = await runAsync(stub.baseUrl)

    assert.equal(result.status, 0)
    assert.equal(result.report.ok, true)
    assert.equal(result.report.getOnly, true)
    assert.equal(result.report.tokenSent, false)
    assert.equal(result.report.requestBodySent, false)
    assert.equal(result.report.routeBlockers.length, 0)
    assert.equal(result.report.sourceRouteAudit.missingSourceRoutes.length, 0)
    assert.equal(result.report.sourceRouteAudit.deployed404WithSourcePresent.length, 0)
    assert.ok(result.report.checked >= 18)
    assert.ok(result.report.results.every((item) => item.localRoute.sourcePresent === true))
    assert.ok(stub.requests.every((item) => item.method === "GET"))
    assert.ok(stub.requests.every((item) => item.authorization === ""))
    assert.ok(stub.requests.every((item) => item.bodyLength === 0))
    assert.ok(stub.requests.every((item) => item.liveSmoke === "online-readonly-boundary"))
  } finally {
    await closeServer(stub.server)
  }
})

test("online readonly boundary checker fails closed on deployed route 404", async () => {
  const stub = await createStubServer((request, response) => {
    const status = request.url.includes("/api/app/knowledge-spaces") ? 404 : 401
    response.writeHead(status, { "content-type": status === 404 ? "text/html" : "application/json" })
    response.end(status === 404 ? "<html>not found</html>" : JSON.stringify({ code: "auth_required" }))
  })

  try {
    const result = await runAsync(stub.baseUrl)

    assert.equal(result.status, 1)
    assert.equal(result.report.ok, false)
    const blocker = result.report.routeBlockers.find((item) => item.path === "/api/app/knowledge-spaces")
    assert.ok(blocker)
    assert.equal(blocker.localRoute.status, "SOURCE_ROUTE_PRESENT")
    assert.equal(blocker.localRoute.file, "app/api/app/knowledge-spaces/route.ts")
    assert.equal(result.report.sourceRouteAudit.missingSourceRoutes.length, 0)
    assert.deepEqual(result.report.sourceRouteAudit.deployed404WithSourcePresent, [
      {
        id: "employee_knowledge_spaces",
        method: "GET",
        path: "/api/app/knowledge-spaces",
        file: "app/api/app/knowledge-spaces/route.ts",
      },
    ])
    assert.equal(result.report.sourceRouteAudit.localSourceReadyForBlocked404, true)
    assert.equal(result.report.grouped["404"], 1)
    assert.ok(stub.requests.every((item) => item.method === "GET"))
    assert.ok(stub.requests.every((item) => item.authorization === ""))
  } finally {
    await closeServer(stub.server)
  }
})

test("online readonly boundary is wired into production postdeploy release gates", () => {
  const pkg = readJson("package.json")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")
  const deploymentSpecChecker = read("scripts", "check-aliyun-deployment-spec.mjs")
  const operatorHandoff = read("scripts", "generate-aliyun-operator-handoff.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const actionAuthorization = read("scripts", "summarize-aliyun-action-authorization.mjs")

  assert.equal(
    pkg.scripts["aliyun:app-api:online-readonly-boundary"],
    "node ./scripts/check-app-api-online-readonly-boundary.mjs",
  )
  assert.ok(deploySpec.postdeployChecks.includes(postdeployCommand))
  assert.match(deploymentSpecChecker, /aliyun:app-api:online-readonly-boundary -- --base-url https:\/\/api-cn\.ipgongchang\.xin --timeout-ms 15000/)
  assert.match(operatorHandoff, /ONLINE_READONLY_BOUNDARY_NOT_RUN/)
  assert.match(operatorHandoff, /online-readonly-boundary ok=true and 404=0/)
  assert.match(releaseArtifacts, /aliyun:app-api:online-readonly-boundary -- --base-url https:\/\/api-cn\.ipgongchang\.xin --timeout-ms 15000/)
  assert.match(actionAuthorization, /online-readonly-boundary pass with 404=0/)
})
