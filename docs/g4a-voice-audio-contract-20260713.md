# G4A App Voice Audio Contract

Date: 2026-07-13

## v3 change points (G4A-B controller review)

- Turn-audio persistence is role-aware: audio submit updates only a `beautician` turn, while TTS updates only a `customer` turn.
- The production mini-program records `mp3` at 16 kHz, mono, 64 kbps (`pages/voice-coach-flow/chat.js`) and sends preview ASR as `format: "mp3"`; App m4a/AAC is therefore not an approved substitute. App clients must transcode to mp3 before ASR/submit (or the server returns validation error); m4a/AAC is deliberately not whitelisted.
- App clients must treat all implemented request-shape and field validation codes as `422`, including `missing_*` and `invalid_payload`; the earlier `400` behavior is removed.
- App clients must preserve the new stable `502` provider/persist split: ASR provider unavailable/failed, TTS provider/persist failed, and submitted-audio persist failed must not be collapsed into a generic `500`.
- The matrix below is normative for the three App endpoints and now includes the implemented `voice_coach_session_ended`, `missing_*`, and `invalid_payload` codes.

This document is the source contract for the App voice-coach audio chain. All routes require the existing App authentication and active voice-coach feature access. Session reads and writes are scoped by `user_id`, `company_id`, `store_id`, and `membership_id`; a non-owned session is not disclosed and returns `404 voice_coach_session_not_found`.

## Shared response fields

Successful responses include `ok: true`, `session_id`, `repository_mode`, `provider_mode`, and the existing `context` / `voice_coach_scope` projection. Audio routes use `provider_mode` of `volc_speech_asr_flash` or `volc_speech_tts` even when their repository mode is the RDS text-session contract.

## ASR preview

`POST /api/app/voice-coach/sessions/{sessionId}/asr-preview`

Content type is `application/json`.

Required field: `audio_b64` (base64 audio, decoded size at most 512 KiB). Optional `format` is one of `mp3`, `wav`, `ogg`, or `flac`; omitted means `mp3`.

Success is `200` with `text`, `confidence`, `audio_seconds`, and `request_id` from the existing Volc Flash ASR provider. Invalid or empty audio returns `422` with one of `voice_coach_audio_required`, `voice_coach_audio_empty`, `voice_coach_audio_too_large`, or `voice_coach_audio_format_invalid`. A malformed or foreign session returns `404`.

## TTS synthesis

`POST /api/app/voice-coach/sessions/{sessionId}/turns/{turnId}/tts`

The target must be a customer turn in the caller's scoped session. Success is `200` with `turn_id`, signed `audio_url`, `audio_seconds`, `cached`, and `request_id` when newly synthesized. Existing audio returns the same shape with `cached: true`. Missing session/turn returns `404`; a non-customer turn or empty text returns `422`; an empty provider result returns `502 voice_coach_tts_empty_audio`.

## Audio turn submit

`POST /api/app/voice-coach/sessions/{sessionId}/beautician-turn/submit`

Content type is `multipart/form-data`.

Required fields are `audio` (mp3/wav/ogg/flac, at most 512 KiB), `transcript_text`, `reply_to_turn_id`, and `client_attempt_id` (8 to 120 characters). Optional `client_audio_seconds` is a non-negative number. `transcript_text` is the sole persisted reply text; `text`, `asr_text`, and `reply_text` are not substitutes.

Success is `200` with `turn_id`, `client_attempt_id`, `deduped`, `beautician_turn` (including signed `audio_url`), `next_customer_turn`, `next_cursor`, and `reached_max_turns`. The audio object key is deterministic for the user/session/attempt, while the G3C RDS transaction locks the scoped session before checking or appending the attempt.

Reusing an attempt with the same normalized submitted text and `reply_to_turn_id` returns the original turn with `deduped: true`; changing either returns `409 voice_coach_idempotency_conflict`. An ended session returns `409 voice_coach_session_ended`, and a stale reply target returns `409 voice_coach_reply_target_stale`. Missing or invalid request fields return `422` with the codes listed above plus `transcript_text_required`, `client_attempt_id_required`, `client_attempt_id_invalid`, or `reply_to_turn_id_required`.

## Boundaries

No credential is returned or persisted by this contract. Volc credentials continue to be supplied only through the existing `VOLC_*` runtime environment convention. Local tests mock provider and object storage calls; a passing local suite is not evidence of deployed credentials, production storage, or true-device microphone behavior.

## Error matrix

| Endpoint | 401 | 403 | 404 | 409 | 422 | 5xx / business codes |
| --- | --- | --- | --- | --- | --- | --- |
| ASR preview | `auth_required` | `voice_coach_feature_forbidden` | `voice_coach_session_not_found` | — | `missing_session_id`, `invalid_payload`, `voice_coach_audio_required`, `voice_coach_audio_empty`, `voice_coach_audio_too_large`, `voice_coach_audio_format_invalid` | `voice_coach_asr_provider_unavailable` (502), `voice_coach_asr_provider_failed` (502) |
| Turn TTS | `auth_required` | `voice_coach_feature_forbidden` | `voice_coach_session_not_found`, `voice_coach_turn_not_found` | — | `missing_params`, `voice_coach_tts_turn_not_customer`, `voice_coach_tts_text_required` | `voice_coach_tts_empty_audio` (502), `voice_coach_tts_provider_failed` (502), `voice_coach_tts_persist_failed` (502) |
| Audio submit | `auth_required` | `voice_coach_feature_forbidden` | `voice_coach_session_not_found` | `voice_coach_session_ended`, `voice_coach_idempotency_conflict`, `voice_coach_reply_target_stale` | `missing_session_id`, `invalid_payload`, `transcript_text_required`, `client_attempt_id_required`, `client_attempt_id_invalid`, `reply_to_turn_id_required`, `voice_coach_audio_required`, `voice_coach_audio_empty`, `voice_coach_audio_too_large`, `voice_coach_audio_format_invalid` | `voice_coach_audio_persist_failed` (502), `voice_coach_turn_submit_failed` (500) |
