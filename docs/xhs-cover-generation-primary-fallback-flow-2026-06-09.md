# XHS Cover Generation Primary/Fallback Flow

## Current Status

- Date updated: 2026-06-14
- Status: target flow for a backend release candidate.
- Current production note: this flow was historically deployed during the 2026-06-09 incident, but later clean backend releases moved production forward without the still-dirty XHS fallback files. It must be committed and deployed again before it can be treated as current production behavior.
- Related live-but-separate change: poster backend protocol fields are already live through the later Manbeilian cache-header production deploy.

## Target Production Configuration

- Primary image provider: APIMart
- Backup image provider: Evolink
- Intended env:
  - `EVOLINK_IMAGE_PRIMARY=0`
  - `ALLOW_EVOLINK_IMAGE_PRIMARY=1`
  - `APIMART_IMAGE_FALLBACK_AFTER_MS=150000`
- Cost policy: APIMart is cheaper, so the backend should wait for APIMart first and use Evolink only when APIMart is clearly failed, timed out, unavailable, or pending beyond the fallback window.

## Target User Request Flow

1. Mini-program user taps generate cover on Xiaohongshu page.
2. Mini-program calls `POST /api/mp/xhs/generate-cover-image`.
3. Mini-program request timeout is `240000ms`, so a normal APIMart run of 80-110 seconds should not be aborted by the client.
4. Backend authenticates the user through the normal Bearer token path.
5. Backend charges the configured AI points action before generation.
6. Backend builds the cover prompt and sends image generation to APIMart first.
7. If APIMart returns an image directly, backend returns it.
8. If APIMart returns a task id, backend polls `/tasks/:taskId`.
9. If APIMart completes within 150 seconds, backend returns the APIMart image and does not call Evolink.
10. If APIMart fails, aborts, lacks a task id, request-times out, or stays pending past the fallback window, backend tries Evolink.
11. If a draft id is present, backend stores the cover in Supabase Storage and updates `xhs_drafts.cover_storage_path`.
12. Backend tracks `mp_xhs_cover_success` or `mp_xhs_cover_gpt_image_fail`.
13. If generation fails, backend refunds AI points.

## Fallback Rules

Fallback to Evolink happens when APIMart has one of these conditions:

- Task status is `failed`, including messages like `This operation was aborted`.
- Request fails with abort/timeout-like errors.
- APIMart returns retryable HTTP errors such as overload, rate limit, server error, or provider credit/quota failure.
- APIMart does not return a task id.
- APIMart remains pending/processing for more than `APIMART_IMAGE_FALLBACK_AFTER_MS`.

Fallback does not happen just because APIMart is still pending under 150 seconds.

## Historical Timing Evidence

These checks are from the 2026-06-09 incident and justify the target window. They are not proof that the current dirty diff is live.

- APIMart direct API timing check:
  - Model: `gpt-image-2`
  - Result: completed
  - Elapsed: `102806ms`
  - Status before completion: `pending`
  - Conclusion: 90 seconds was too short and could switch to backup while the cheaper primary was still normally working.

- Historical authenticated production smoke:
  - Endpoint: `POST https://www.ipnrgc.com/api/mp/xhs/generate-cover-image`
  - Result: `200`
  - Model: `gpt-image-2`
  - `fallbackUsed=false`
  - `providerFailureCount=0`
  - `providerElapsedMs=88826`
  - `totalElapsedMs=88826`
  - Temporary test auth/profile user deleted.

- Historical telemetry after that deploy:
  - `mp_xhs_cover_success`
  - `model=gpt-image-2`
  - `fallbackUsed=false`
  - `providerFailureCount=0`
  - `providerElapsedMs` around 85-89 seconds

## Monitoring Fields

Check `analytics_events` for:

- `event=mp_xhs_cover_success`
- `props.model`
- `props.fallbackUsed`
- `props.providerFailureCount`
- `props.providerElapsedMs`
- `props.totalElapsedMs`

Interpretation:

- `model=gpt-image-2` and `fallbackUsed=false`: APIMart primary succeeded.
- `model=evolink:gpt-image-2` and `fallbackUsed=true`: APIMart failed or exceeded the fallback window, then Evolink succeeded.
- `mp_xhs_cover_gpt_image_fail`: all eligible providers failed or the failure was not recoverable.

## Release Validation Checklist

Required before releasing this flow again:

- Confirm the user has explicitly authorized this thread as backend release thread.
- Confirm current production env with Vercel before deploy.
- Run local tests:
  - `node --test tests/image-provider-fallback.runtime.test.js tests/xhs-cover-style.static.test.js`
  - `corepack pnpm exec tsc --noEmit --pretty false`
  - `corepack pnpm exec eslint lib/posters/gpt-image-2.server.ts app/api/mp/xhs/generate-cover-image/route.ts tests/image-provider-fallback.runtime.test.js tests/xhs-cover-style.static.test.js`
- Run production API contract checks on both domains after deploy:
  - `node tools/check-mp-api-contract-before-asset-release.js https://www.ipnrgc.com`
  - `node tools/check-mp-api-contract-before-asset-release.js https://ip.ipgongchang.xin`
- Confirm unauthenticated cover route returns `401 auth_required`.
- Run one authenticated production smoke only when needed, because it burns one real image generation.
