import http from "node:http"
import { basename } from "node:path"

import { config } from "./config.js"
import { createVoiceCoachWsServer } from "./ws-server.js"

/**
 * Start the standalone voice coach websocket service.
 */
export async function startVoiceCoachWsServer(): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({ ok: true }))
      return
    }

    res.writeHead(200, { "content-type": "application/json" })
    res.end(JSON.stringify({ ok: true, service: "voice-coach-ws" }))
  })

  createVoiceCoachWsServer(server)

  await new Promise<void>((resolve) => {
    server.listen(config.port, resolve)
  })

  console.info(`[voice-coach-ws] listening on :${config.port}`)
  return server
}

if (process.argv[1] && ["index.js", "index.ts"].includes(basename(process.argv[1]))) {
  void startVoiceCoachWsServer()
}
