# Voice Coach Real Device Smoke Checklist

## Scope
- Current target: WebSocket main path + short-utterance HTTP fallback.
- Goal: verify first prompt playback, autoplay arbitration, short-utterance fallback, and hint single-flight behavior on real devices.
- Evidence required for every failed item:
  - `[vc]` console lines
  - DevTools Network screenshot
  - Real-device UI screenshot or screen recording

## Precheck
- Recompile the mini-program in WeChat DevTools before each run.
- Reconnect the real device after every fresh compile.
- Start from a brand new practice session.
- Keep Network panel open with `Preserve log` enabled.
- Keep Console panel open and filter by `[vc]`.

## Scenario 1: First Prompt Playback
- Create a new session.
- Wait for `session.create:ok`.
- Confirm logs include:
  - `initial.prompt:ready`
  - `initial.prompt:play`
  - `audio.ctx.play`
- Confirm the first customer prompt is actually audible on the phone.
- While the first prompt is still playing, tap record once.
- Confirm logs include `record.start:blocked-initial-prompt`.
- After the first prompt ends, tap record again and confirm recording starts normally.

Pass criteria:
- First prompt is audible without needing a second interaction.
- The first tap during prompt playback is blocked.
- The second tap after prompt completion starts recording.

## Scenario 2: Short Utterance HTTP Fallback
- In a new or fresh session, say a short sentence for 1-2 seconds.
- Confirm logs include:
  - `ws.short-utterance:http`
  - `turn.submit:start {mode: "http"...}`
  - `events.force:start`
  - `ev.customer.audio_ready`
  - `events.force:done`
- Confirm the short-utterance round returns a customer reply with audio.
- While HTTP fallback is still active, tap record again once.
- Confirm logs include `record.start:blocked-http-fallback`.

Pass criteria:
- No `asr_empty_result`.
- No `duplicate key value violates "voice_coach_turns_session_turn_index_key"`.
- HTTP fallback round completes with customer audio.
- New recording is blocked until that fallback round finishes.

## Scenario 3: Long Utterance WebSocket Path
- In a new or fresh session, speak for 3 seconds or longer.
- Confirm logs include:
  - `ws.audio.start`
  - multiple `record.frame`
  - `ws.audio.end`
  - `ws.asr.final`
  - `ws.turn.saved`
  - `ws.tts.done`
- Confirm the customer reply audio is audible.

Pass criteria:
- The turn stays on WebSocket and does not fall back to HTTP.
- Customer reply audio is present and audible.

## Scenario 4: Autoplay Arbitration
- Trigger a customer reply with audio.
- While that reply is about to autoplay, manually tap an older beautician turn to play it.
- Confirm the latest customer turn does not repeatedly steal the shared audio context during that manual playback.
- After manual playback ends, confirm the latest customer turn can autoplay once.

Pass criteria:
- Manual playback temporarily suppresses autoplay.
- Only the newest customer turn is allowed to autoplay.
- Old turns do not keep restarting themselves.

## Scenario 5: First-Turn Diversity
- Create 5 brand new sessions in a row.
- Capture `session.create:ok` for each run.
- Record:
  - `firstText`
  - `audioSource`
  - whether the first prompt is audible

Pass criteria:
- `firstText` varies across sessions.
- `audioSource` is not a forced fixed seed path unless explicitly configured.
- First prompt voice matches the later customer voice style.

## Scenario 6: Hint Single Flight
- After a customer reply appears, tap the hint button quickly 3-5 times.
- Confirm logs include a single `hint.open:start`.
- Repeated taps during the first request should show `hint.open:skip` or be ignored.

Pass criteria:
- Only one network request is sent for one burst of taps.
- Only one toast/error path is shown on failure.

## Scenario 7: Background / Foreground
- Start a session and play at least one audio reply.
- Send the app to background and return.
- Confirm logs include:
  - `page.hide`
  - `page.show`
- Confirm recorder state is reset and audio does not remain stuck.

Pass criteria:
- No stuck recording button.
- No stale autoplay restarts after returning.

## Required Log Lines To Capture
- `session.create:ok`
- `initial.prompt:ready`
- `initial.prompt:play`
- `record.start:blocked-initial-prompt`
- `ws.short-utterance:http`
- `turn.submit:start {mode: "http"}`
- `events.force:start`
- `events.force:done`
- `ev.customer.audio_ready`
- `audio.autoplay`
- `audio.ctx.play`
- `audio.ctx.ended`
- `record.start:blocked-http-fallback`
- `hint.open:start`
- `hint.open:skip`

## Notes
- If a run still shows the old HTTP `submit + stream` main path for long utterances, capture the full log and stop the run.
- If first prompt is reported as “playing” in logs but is not audible to the user, capture both the `[vc]` console and the device-side experience note; that is a playback-routing bug, not a WebSocket bug.
