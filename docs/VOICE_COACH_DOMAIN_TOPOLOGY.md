# Voice Coach Production Topology

更新时间：2026-03-25

## 当前真实入口

- 小程序配置文件：`mini-program-ui/utils/config.js`
- 小程序统一请求域名：`https://ip.ipgongchang.xin`

## 当前生产拓扑

### HTTP / API

流量路径：

`小程序 -> https://ip.ipgongchang.xin -> ECS Nginx -> https://www.ipnrgc.com -> Vercel Next.js`

说明：

- 小程序不会直接请求 `www.ipnrgc.com`
- 但 `ip.ipgongchang.xin` 的 HTTP 请求当前由 ECS 上的 Nginx 反代到 `https://www.ipnrgc.com`
- 因此，只要改的是 Next.js `app/api/*` 或主站页面，最终都需要发到 Vercel

ECS 当前 Nginx 关键配置：

```nginx
location / {
  proxy_pass https://www.ipnrgc.com;
  proxy_set_header Host www.ipnrgc.com;
  proxy_ssl_server_name on;
}
```

### WebSocket

流量路径：

`小程序 -> wss://ip.ipgongchang.xin/ws/voice-coach -> ECS Nginx -> 127.0.0.1:8080`

说明：

- 实时语音 WebSocket 不走 Vercel
- 它是 ECS 本机上的独立 Node 服务 `voice-coach-ws`
- 这条链路改动后，必须上 ECS 并重启 PM2

ECS 当前 Nginx 关键配置：

```nginx
location = /ws/voice-coach {
  proxy_pass http://127.0.0.1:8080;
}

location = /ws-health {
  proxy_pass http://127.0.0.1:8080/healthz;
}
```

## 改动与部署对应关系

### 需要发 Vercel 的改动

- `app/api/*`
- `lib/*` 中被 Next.js API route 调用的服务端逻辑
- 任何主站页面/SSR/Next.js middleware

典型例子：

- `app/api/voice-coach/sessions/route.ts`
- `app/api/voice-coach/sessions/[sessionId]/turns/[turnId]/tts/route.ts`
- `app/api/voice-coach/sessions/[sessionId]/events/route.ts`

### 需要发 ECS 的改动

- `voice-coach-ws/*`
- WebSocket 实时 ASR / LLM / TTS pipeline
- PM2 进程配置
- ECS 上的 Nginx `/ws/voice-coach` 相关配置

典型例子：

- `voice-coach-ws/src/pipeline/streaming-asr.ts`
- `voice-coach-ws/src/pipeline/streaming-llm.ts`
- `/etc/nginx/conf.d/ip.ipgongchang.xin.conf`

### 需要重新编译小程序的改动

- `mini-program-ui/*`
- 包括 UI、交互、音效、头像、播放状态机、前端请求时机

## 线上排障时的判断规则

### 如果问题出在这些现象，优先看 Vercel / Next.js

- `session.create`
- `/tts`
- `/events`
- `/hint`
- `/report`
- `turn.submit` 的 HTTP 路径

### 如果问题出在这些现象，优先看 ECS / WS

- `ws.connect`
- `session.ready`
- `asr.partial`
- `asr.final`
- `llm.done`
- `tts.sentence_start`
- `audio_chunk_failed`
- `streaming_asr_closed`

### 如果问题只体现在界面/交互

- 头像裁切
- 气泡对齐
- 音效
- 按住说话按钮反馈
- 首句是否立即出泡

优先看小程序前端，并重新编译真机包。

## 当前结论

- `www.ipnrgc.com` 不是小程序直接请求的域名
- 但当前小程序 HTTP/API 链路会通过 ECS 反代最终落到 `www.ipnrgc.com`
- 所以：
  - Next.js API 改动：发 Vercel
  - WebSocket 改动：发 ECS
  - 小程序 UI/交互改动：重新编译小程序
