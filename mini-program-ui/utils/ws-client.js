const DEFAULT_RECONNECT_DELAYS = [1000, 2000, 4000]

function isArrayBufferLike(value) {
  return value instanceof ArrayBuffer || ArrayBuffer.isView(value)
}

function arrayBufferFrom(input) {
  if (input instanceof ArrayBuffer) return input
  if (ArrayBuffer.isView(input)) {
    return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)
  }
  if (typeof input === "string") {
    return new TextEncoder().encode(input).buffer
  }
  return new Uint8Array(0).buffer
}

function buildWsUrl(baseUrl, sessionId, token) {
  const raw = String(baseUrl || "").trim()
  const match = raw.match(/^(https?|wss?):\/\/([^/?#]+)(?:[/?#].*)?$/i)
  if (!match) {
    throw new Error("ws_invalid_base_url")
  }

  const protocol = String(match[1] || "").toLowerCase()
  const host = String(match[2] || "")
  const wsProtocol = protocol === "https" ? "wss" : protocol === "http" ? "ws" : protocol
  const query = [`session_id=${encodeURIComponent(String(sessionId || ""))}`]
  if (token) {
    query.push(`token=${encodeURIComponent(String(token))}`)
  }
  return `${wsProtocol}://${host}/ws/voice-coach?${query.join("&")}`
}

function createAbortError(message) {
  const err = new Error(message || "ws_disconnected")
  err.name = "AbortError"
  return err
}

class VoiceCoachWsClient {
  constructor(baseUrl, sessionId, token, options = {}) {
    this.baseUrl = String(baseUrl || "")
    this.sessionId = String(sessionId || "")
    this.token = String(token || "")
    this.options = options
    this.socketTask = null
    this.connectPromise = null
    this.connectResolve = null
    this.connectReject = null
    this.outboundQueue = []
    this.pendingBinaryBytes = 0
    this.sending = false
    this.drainWaiters = []
    this.manualClose = false
    this.closed = false
    this.reconnectAttempts = 0
    this.reconnectTimer = null
    this.listeners = {
      message: [],
      binary: [],
      close: [],
      error: [],
      open: [],
      reconnecting: [],
    }
  }

  connect() {
    if (this.connectPromise) return this.connectPromise
    this.manualClose = false
    this.closed = false
    this.connectPromise = new Promise((resolve, reject) => {
      this.connectResolve = resolve
      this.connectReject = reject
      this.openSocket()
    })
    return this.connectPromise
  }

  disconnect() {
    this.manualClose = true
    this.closed = true
    this.clearReconnectTimer()
    this.rejectDrainWaiters(new Error("ws_closed"))
    const task = this.socketTask
    this.socketTask = null
    this.sending = false
    if (
      task &&
      typeof task.close === "function" &&
      (task._wsReadyState === 0 || task._wsReadyState === 1)
    ) {
      try {
        task._wsReadyState = 2
        task.close({ code: 1000, reason: "manual_close" })
      } catch (_err) {}
    }
    this.rejectConnect(new Error("ws_closed"))
  }

  reconnect() {
    this.manualClose = false
    this.closed = false
    this.clearReconnectTimer()
    this.closeSocket(false)
    this.openSocket(true)
  }

  sendJson(message) {
    const payload = JSON.stringify(message)
    this.queueOutbound({ kind: "json", data: payload })
    return this.isConnected()
  }

  sendBinary(buffer) {
    if (!isArrayBufferLike(buffer)) {
      throw new Error("ws_binary_chunk_must_be_arraybuffer")
    }
    const payload = arrayBufferFrom(buffer)
    this.queueOutbound({ kind: "binary", data: payload })
    return this.isConnected()
  }

  drain(timeoutMs = 500) {
    if (!this.outboundQueue.length && !this.sending) {
      return Promise.resolve()
    }
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, timer: null }
      if (timeoutMs > 0) {
        waiter.timer = setTimeout(() => {
          this.removeDrainWaiter(waiter)
          reject(new Error("ws_drain_timeout"))
        }, timeoutMs)
      }
      this.drainWaiters.push(waiter)
      this.processQueue()
    })
  }

  onMessage(handler) {
    return this.addListener("message", handler)
  }

  onBinary(handler) {
    return this.addListener("binary", handler)
  }

  onClose(handler) {
    return this.addListener("close", handler)
  }

  onError(handler) {
    return this.addListener("error", handler)
  }

  onOpen(handler) {
    return this.addListener("open", handler)
  }

  onReconnecting(handler) {
    return this.addListener("reconnecting", handler)
  }

  isConnected() {
    const task = this.socketTask
    return Boolean(task && typeof task === "object" && task._wsReadyState === 1)
  }

  addListener(type, handler) {
    if (typeof handler !== "function") return () => {}
    this.listeners[type].push(handler)
    return () => {
      const list = this.listeners[type]
      const idx = list.indexOf(handler)
      if (idx >= 0) list.splice(idx, 1)
    }
  }

  emit(type, payload) {
    const list = this.listeners[type]
    for (let i = 0; i < list.length; i++) {
      try {
        list[i](payload)
      } catch (_err) {}
    }
  }

  openSocket(isReconnect = false) {
    if (!this.baseUrl || !this.sessionId) {
      this.rejectConnect(new Error("ws_missing_config"))
      return
    }

    const url = buildWsUrl(this.baseUrl, this.sessionId, this.token)
    const header = {}
    if (this.token) header.Authorization = `Bearer ${this.token}`

    try {
      const task = wx.connectSocket({
        url,
        header,
        timeout: Number(this.options.timeoutMs || 10000),
      })
      task._wsReadyState = 0
      this.socketTask = task

      if (typeof task.onOpen === "function") {
        task.onOpen(() => {
          if (this.socketTask !== task) return
          task._wsReadyState = 1
          this.reconnectAttempts = 0
          this.processQueue()
          this.resolveConnect()
          this.emit("open", { reconnect: isReconnect })
        })
      }

      if (typeof task.onMessage === "function") {
        task.onMessage((evt) => {
          if (this.socketTask !== task) return
          this.handleMessage(evt && evt.data)
        })
      }

      if (typeof task.onError === "function") {
        task.onError((error) => {
          task._wsReadyState = 3
          if (this.socketTask !== task) return
          if (task._wsTerminalHandled) return
          task._wsTerminalHandled = true
          this.handleSocketError(error)
        })
      }

      if (typeof task.onClose === "function") {
        task.onClose((evt) => {
          task._wsReadyState = 3
          if (this.socketTask !== task) return
          if (task._wsTerminalHandled) return
          task._wsTerminalHandled = true
          this.handleSocketClose(evt)
        })
      }
    } catch (error) {
      this.handleSocketError(error)
    }
  }

  handleMessage(data) {
    if (typeof data === "string") {
      let parsed = null
      try {
        parsed = JSON.parse(data)
      } catch (_err) {
        return
      }
      this.emit("message", parsed)
      return
    }

    const frame = arrayBufferFrom(data)
    if (frame.byteLength < 4) return
    const view = new DataView(frame)
    const sentenceIndex = view.getUint32(0, false)
    const audio = frame.slice(4)
    this.emit("binary", { sentenceIndex, audio })
  }

  handleSocketError(error) {
    const err = error instanceof Error ? error : new Error(String(error?.errMsg || error?.message || "ws_error"))
    this.rejectDrainWaiters(err)
    this.emit("error", err)
    if (this.manualClose) return
    this.scheduleReconnect(err)
  }

  handleSocketClose(evt) {
    if (this.manualClose) {
      this.rejectDrainWaiters(createAbortError("ws_closed"))
      this.emit("close", evt || {})
      return
    }
    const err = createAbortError("ws_closed")
    this.rejectDrainWaiters(err)
    this.emit("close", evt || {})
    this.scheduleReconnect(err)
  }

  scheduleReconnect(error) {
    if (this.manualClose || this.closed) return
    if (this.reconnectAttempts >= DEFAULT_RECONNECT_DELAYS.length) {
      this.closed = true
      this.clearReconnectTimer()
      this.rejectConnect(error)
      this.emit("close", { error, permanent: true })
      return
    }

    const delay = DEFAULT_RECONNECT_DELAYS[this.reconnectAttempts] || DEFAULT_RECONNECT_DELAYS[DEFAULT_RECONNECT_DELAYS.length - 1]
    this.reconnectAttempts += 1
    this.emit("reconnecting", { attempt: this.reconnectAttempts, delay, error })
    this.clearReconnectTimer()
    this.reconnectTimer = setTimeout(() => {
      this.openSocket(true)
    }, delay)
  }

  queueOutbound(item) {
    if (!item || !item.kind) return
    this.outboundQueue.push(item)
    if (item.kind === "binary") {
      const cap = Number(this.options.binaryQueueBytes || 1024 * 1024)
      this.pendingBinaryBytes += item.data.byteLength || 0
      while (this.pendingBinaryBytes > cap) {
        const removeIdx = this.outboundQueue.findIndex((entry) => entry && entry.kind === "binary")
        if (removeIdx < 0) break
        const [removed] = this.outboundQueue.splice(removeIdx, 1)
        this.pendingBinaryBytes -= removed && removed.data ? removed.data.byteLength || 0 : 0
      }
      if (this.pendingBinaryBytes < 0) this.pendingBinaryBytes = 0
    } else {
      let jsonCount = 0
      for (let i = this.outboundQueue.length - 1; i >= 0; i--) {
        if (this.outboundQueue[i] && this.outboundQueue[i].kind === "json") {
          jsonCount += 1
          if (jsonCount > 100) {
            this.outboundQueue.splice(i, 1)
          }
        }
      }
    }
    this.processQueue()
  }

  processQueue() {
    if (!this.isConnected() || !this.socketTask) return
    if (this.sending) return
    const next = this.outboundQueue.shift()
    if (!next) {
      this.resolveDrainWaiters()
      return
    }
    if (next.kind === "binary") {
      this.pendingBinaryBytes -= next.data.byteLength || 0
      if (this.pendingBinaryBytes < 0) this.pendingBinaryBytes = 0
    }
    this.sending = true

    try {
      this.socketTask.send({
        data: next.data,
        success: () => {
          this.sending = false
          this.processQueue()
        },
        fail: (error) => {
          this.sending = false
          this.handleSocketError(error)
        },
      })
    } catch (error) {
      this.sending = false
      this.handleSocketError(error)
    }
  }

  resolveDrainWaiters() {
    if (!this.drainWaiters.length || this.outboundQueue.length || this.sending) return
    const waiters = this.drainWaiters.splice(0, this.drainWaiters.length)
    waiters.forEach((waiter) => {
      if (waiter.timer) clearTimeout(waiter.timer)
      waiter.resolve()
    })
  }

  rejectDrainWaiters(error) {
    if (!this.drainWaiters.length) return
    const waiters = this.drainWaiters.splice(0, this.drainWaiters.length)
    waiters.forEach((waiter) => {
      if (waiter.timer) clearTimeout(waiter.timer)
      waiter.reject(error)
    })
  }

  removeDrainWaiter(target) {
    const idx = this.drainWaiters.indexOf(target)
    if (idx < 0) return
    const [waiter] = this.drainWaiters.splice(idx, 1)
    if (waiter && waiter.timer) clearTimeout(waiter.timer)
  }

  resolveConnect() {
    if (this.connectResolve) {
      this.connectResolve()
      this.connectResolve = null
      this.connectReject = null
      this.connectPromise = null
    }
  }

  rejectConnect(error) {
    if (this.connectReject) {
      this.connectReject(error)
      this.connectResolve = null
      this.connectReject = null
      this.connectPromise = null
    }
  }

  closeSocket(shouldEmit = true) {
    const task = this.socketTask
    this.socketTask = null
    this.sending = false
    if (!task) return
    try {
      if (
        typeof task.close === "function" &&
        (task._wsReadyState === 0 || task._wsReadyState === 1)
      ) {
        task._wsReadyState = 2
        task.close({ code: 1000, reason: "close" })
      }
    } catch (_err) {}
    if (shouldEmit) {
      this.emit("close", { manual: this.manualClose })
    }
  }

  clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
}

module.exports = {
  VoiceCoachWsClient,
  buildWsUrl,
}
