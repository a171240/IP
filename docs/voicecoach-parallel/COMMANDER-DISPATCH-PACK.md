# Voice Coach Dispatch Pack

Repo: `/Users/zhuan/IP项目/ip-content-factory`

## 1. Commander Kickoff
```text
【Voice Coach 并行开发启动】
目标：把语音链路从“录完上传的异步任务”升级为“低延迟、可打断的实时语音交互系统”。
统一协议文件：/Users/zhuan/IP项目/ip-content-factory/lib/voice-coach/realtime-contract.ts
统一调度文档：/Users/zhuan/IP项目/ip-content-factory/docs/voicecoach-parallel/COMMANDER.md
规则：先冻结协议，再并行开发；不得私改字段名；合并顺序固定；VOICE_COACH_REALTIME_ENABLED=false 必须始终可回退。
先执行：bash /Users/zhuan/IP项目/ip-content-factory/scripts/setup_voicecoach_parallel.sh
```

## 2. Dispatch To Codex-A
```text
你负责协议与观测：
文档：/Users/zhuan/IP项目/ip-content-factory/docs/voicecoach-parallel/CODEX-A-CONTRACT.md
分支：codex/voicecoach-contract
目录：/private/tmp/ip-vc-contract
```

## 3. Dispatch To Codex-B
```text
你负责 legacy submit 提速：
文档：/Users/zhuan/IP项目/ip-content-factory/docs/voicecoach-parallel/CODEX-B-FASTPATH.md
分支：codex/voicecoach-fastpath
目录：/private/tmp/ip-vc-fastpath
```

## 4. Dispatch To Codex-C
```text
你负责 realtime gateway：
文档：/Users/zhuan/IP项目/ip-content-factory/docs/voicecoach-parallel/CODEX-C-REALTIME.md
分支：codex/voicecoach-realtime
目录：/private/tmp/ip-vc-realtime
```

## 5. Dispatch To Codex-D
```text
你负责 mini program realtime 客户端：
文档：/Users/zhuan/IP项目/ip-content-factory/docs/voicecoach-parallel/CODEX-D-MINIAPP.md
分支：codex/voicecoach-miniapp
目录：/private/tmp/ip-vc-miniapp
```
