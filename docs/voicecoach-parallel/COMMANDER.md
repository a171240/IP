# Voice Coach Commander Manual

Applies to: `/Users/zhuan/IP项目/ip-content-factory`

## 1. Mission
You coordinate the low-latency voice-coach rebuild with 4 Codex workstreams.

Priorities:
1. Freeze protocol and metrics first.
2. Keep legacy submit path stable until realtime is verified.
3. Merge in a fixed order.
4. Enforce replayable checks after each integration window.

## 2. Global Rules
1. Do not develop in `/Users/zhuan/IP项目/ip-content-factory` directly. That checkout is allowed to stay dirty.
2. All new work starts from clean worktrees created off `main`.
3. `lib/voice-coach/realtime-contract.ts` is the only source of truth for realtime message names and telemetry keys.
4. Before `codex/voicecoach-contract` merges, other workstreams may scaffold only. No one is allowed to invent field names.
5. `VOICE_COACH_REALTIME_ENABLED=false` must always remain a working rollback path.

## 3. Branches And Worktrees
1. `codex/voicecoach-integration` -> `/private/tmp/ip-vc-integration`
2. `codex/voicecoach-contract` -> `/private/tmp/ip-vc-contract`
3. `codex/voicecoach-fastpath` -> `/private/tmp/ip-vc-fastpath`
4. `codex/voicecoach-realtime` -> `/private/tmp/ip-vc-realtime`
5. `codex/voicecoach-miniapp` -> `/private/tmp/ip-vc-miniapp`

Bootstrap command:
```bash
bash /Users/zhuan/IP项目/ip-content-factory/scripts/setup_voicecoach_parallel.sh
```

## 4. Role Split
1. Codex-A: protocol, env flags, bench fixtures, observability fields.
2. Codex-B: legacy submit acceleration, worker-safe fast-path, inline ASR metrics.
3. Codex-C: standalone realtime gateway and Doubao streaming adapters.
4. Codex-D: mini program socket lifecycle, partial transcript, chunk playback, interrupt handling.

## 5. Merge Order
1. Contract
2. Fast-path
3. Realtime
4. Miniapp
5. Integration

## 6. Integration Gate
Run in `/private/tmp/ip-vc-integration`:
```bash
pnpm lint
pnpm build
pnpm voicecoach:worker
node scripts/asr_selfcheck.mjs
node scripts/bench_voicecoach.mjs
node scripts/run_voicecoach_obs_oneclick.mjs --attempts 3
```

## 7. Acceptance Focus
1. Legacy path can still finish a full round when realtime is off.
2. `submit_fastpath_hit=true` never causes duplicate `customer.text_ready`.
3. Realtime path emits `customer.audio_chunk` before final `customer.audio_ready`.
4. Miniapp interrupt stops current playback locally before notifying server.

## 8. Daily Report Format
```md
[role]
today:
blockers:
next:
files:
risk: low|medium|high
```
