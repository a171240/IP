import type http from "node:http"
import type { Duplex } from "node:stream"
import { URL } from "node:url"
import { WebSocket, WebSocketServer } from "ws"

import { verifySupabaseJwt } from "./auth.js"
import { createAdminSupabaseClient } from "./db/supabase.js"
import { getScenario } from "./shared/scenarios.js"
import { parseClientMsg, type ServerMsg } from "./protocol.js"
import { SessionManager } from "./session/session-manager.js"
import { TurnOrchestrator } from "./pipeline/orchestrator.js"

const sessionManager = new SessionManager()

function parseBearerToken(value: string | undefined): string {
  const raw = String(value || "").trim()
  if (!raw) return ""
  const match = raw.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || raw
}

function readAuthToken(req: http.IncomingMessage, url: URL): string {
  const headerToken = parseBearerToken(req.headers.authorization)
  if (headerToken) return headerToken
  return String(url.searchParams.get("token") || "").trim()
}

function sendHttpError(socket: Duplex, status: number, message: string): void {
  try {
    socket.write(
      `HTTP/1.1 ${status} ${status === 401 ? "Unauthorized" : "Forbidden"}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n${JSON.stringify(
        { error: message },
      )}`,
    )
  } catch {
    // Ignore write failures during upgrade rejection.
  }
}

async function loadSessionSnapshot(sessionId: string, userId: string) {
  const admin = createAdminSupabaseClient()
  const { data: session, error: sessionError } = await admin
    .from("voice_coach_sessions")
    .select("id, user_id, scenario_id, status, scenario_snapshot_json")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single()

  if (sessionError || !session) {
    return { ok: false as const, error: sessionError?.message || "session_not_found" }
  }

  if (session.status !== "active") {
    return { ok: false as const, error: "session_not_active" }
  }

  const { data: turns, error: turnsError } = await admin
    .from("voice_coach_turns")
    .select("id, role, text, emotion, turn_index")
    .eq("session_id", sessionId)
    .order("turn_index", { ascending: true })

  if (turnsError) {
    return { ok: false as const, error: turnsError.message || "turns_query_failed" }
  }

  const normalizedTurns = (turns || []).map((turn) => ({
    role: turn.role === "beautician" ? ("beautician" as const) : ("customer" as const),
    text: String(turn.text || ""),
    emotion: typeof turn.emotion === "string" ? turn.emotion : undefined,
    turn_index: Number(turn.turn_index || 0),
  }))

  return {
    ok: true as const,
    session,
    turns: normalizedTurns,
    scenario: getScenario(session.scenario_id),
    sessionContextText: String(session.scenario_snapshot_json?.prompt_context_text || "").trim(),
  }
}

function sendJson(ws: WebSocket, msg: ServerMsg): void {
  ws.send(JSON.stringify(msg))
}

/**
 * Attach a websocket client to a live voice coach session.
 */
export async function handleVoiceCoachConnection(
  ws: WebSocket,
  req: http.IncomingMessage,
  url: URL,
): Promise<void> {
  const sessionId = String(url.searchParams.get("session_id") || "").trim()
  if (!sessionId) {
    sendJson(ws, { type: "error", code: "session_id_missing", message: "缺少 session_id", recoverable: false })
    ws.close(1008, "session_id_missing")
    return
  }

  const token = readAuthToken(req, url)
  const auth = await verifySupabaseJwt(token)
  if (!auth.ok) {
    sendJson(ws, { type: "error", code: auth.error, message: "认证失败", recoverable: false })
    ws.close(1008, auth.error)
    return
  }

  const snapshot = await loadSessionSnapshot(sessionId, auth.user.id)
  if (!snapshot.ok) {
    sendJson(ws, { type: "error", code: snapshot.error, message: "会话不可用", recoverable: false })
    ws.close(1008, snapshot.error)
    return
  }

  const existing = sessionManager.get(sessionId)
  if (existing) {
    sessionManager.destroy(sessionId)
  }

  const state = sessionManager.create(sessionId, auth.user.id, snapshot.scenario, snapshot.sessionContextText)
  state.turnHistory = snapshot.turns.map((turn) => ({
    role: turn.role,
    text: turn.text,
    emotion: turn.emotion,
  }))
  const lastTurn = snapshot.turns[snapshot.turns.length - 1]
  state.currentTurnIndex = lastTurn ? lastTurn.turn_index + 1 : 1

  const orchestrator = new TurnOrchestrator(
    state,
    (message) => {
      try {
        sendJson(ws, message)
      } catch {
        // Ignore send failures while the socket is closing.
      }
    },
    (data) => {
      try {
        ws.send(data)
      } catch {
        // Ignore send failures while the socket is closing.
      }
    },
  )

  ws.on("message", async (data, isBinary) => {
    try {
      if (isBinary) {
        const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)
        orchestrator.handleAudioChunk(chunk)
        return
      }

      const text = Buffer.isBuffer(data) ? data.toString("utf8") : String(data)
      const raw = JSON.parse(text) as unknown
      const msg = parseClientMsg(raw)

      state.lastActivityAt = Date.now()

      switch (msg.type) {
        case "audio.start":
          await orchestrator.startRecording(msg.turn_index, msg.reply_to_turn_id)
          break
        case "audio.end":
          await orchestrator.finishRecording(msg.client_audio_seconds)
          break
        case "audio.cancel":
          await orchestrator.cancelRecording()
          break
        case "barge_in":
          await orchestrator.bargeIn()
          break
        case "hint.request":
          sendJson(ws, {
            type: "error",
            code: "hint_unavailable_in_ws_mode",
            message: "请继续使用现有 HTTP hint 接口",
            recoverable: true,
          })
          break
        case "session.end":
          sendJson(ws, {
            type: "error",
            code: "session_end_unavailable_in_ws_mode",
            message: "请继续使用现有 HTTP end/report 接口",
            recoverable: true,
          })
          break
        default: {
          const _exhaustive: never = msg
          return _exhaustive
        }
      }
    } catch (error) {
      sendJson(ws, {
        type: "error",
        code: "client_message_failed",
        message: error instanceof Error ? error.message : "消息处理失败",
        recoverable: true,
      })
    }
  })

  ws.on("close", () => {
    orchestrator.dispose()
    sessionManager.destroy(sessionId)
  })

  ws.on("error", () => {
    orchestrator.dispose()
    sessionManager.destroy(sessionId)
  })

  sendJson(ws, {
    type: "session.ready",
    session_id: sessionId,
    scenario: snapshot.scenario,
  })
}

/**
 * Create the websocket server that handles voice coach realtime connections.
 */
export function createVoiceCoachWsServer(server: http.Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true })

  server.on("upgrade", (req, socket, head) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`)
      if (url.pathname !== "/ws/voice-coach") {
        sendHttpError(socket, 404, "not_found")
        socket.destroy()
        return
      }

      void (async () => {
        const sessionId = String(url.searchParams.get("session_id") || "").trim()
        const token = readAuthToken(req, url)
        const auth = await verifySupabaseJwt(token)
        if (!sessionId || !auth.ok) {
          sendHttpError(socket, 401, auth.ok ? "session_id_missing" : auth.error)
          socket.destroy()
          return
        }

        const snapshot = await loadSessionSnapshot(sessionId, auth.user.id)
        if (!snapshot.ok) {
          sendHttpError(socket, 403, snapshot.error)
          socket.destroy()
          return
        }

        wss.handleUpgrade(req, socket, head, (ws) => {
          void handleVoiceCoachConnection(ws, req, url)
        })
      })().catch((error) => {
        sendHttpError(socket, 500, error instanceof Error ? error.message : "upgrade_failed")
        socket.destroy()
      })
    } catch (error) {
      sendHttpError(socket, 500, error instanceof Error ? error.message : "upgrade_failed")
      socket.destroy()
    }
  })

  return wss
}
