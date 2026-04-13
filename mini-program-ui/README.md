# Mini Program Quick Start

If you are working on the WeChat mini program, read these first:

- Main mini-program spec: `../docs/DEV_SPEC_MINIPROGRAM.md`
- Domain and deployment topology: `../docs/VOICE_COACH_DOMAIN_TOPOLOGY.md`

Current production topology:

- HTTP/API entry: `https://ip.ipgongchang.xin`
- WebSocket entry: `wss://ip.ipgongchang.xin/ws/voice-coach`
- HTTP/API path: `ip.ipgongchang.xin -> ECS Nginx -> https://www.ipnrgc.com -> Vercel`
- WebSocket path: `ip.ipgongchang.xin/ws/voice-coach -> ECS Nginx -> 127.0.0.1:8080`

Deployment rules:

- Change `app/api/*`: deploy Vercel
- Change `voice-coach-ws/*`: deploy ECS
- Change `mini-program-ui/*`: rebuild the mini program
