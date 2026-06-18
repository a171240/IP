# Professional Learning Static Assets 404 Investigation

Date: 2026-06-18

## Current Judgment

The mini-program is requesting the approved image host, but the current backend
production deployment does not contain most of the professional-learning JPG
files needed by the live mini-program package.

## Confirmed Facts

- Current production alias `https://www.ipnrgc.com` points to deployment
  `dpl_FwFcEx4TD7n8bYu3o7wVciQasacF`.
- Current deployment created at 2026-06-18 11:08:06 CST.
- `GET /api/mp/profile` returns `401 auth_required`, so the backend app route
  exists and is not a blanket outage.
- Current mini-program rendered professional-learning image gate:
  `renderedUniqueUrls=819`, `ok=11`, `failureCount=808`.
- Failed representative URL:
  `https://www.ipnrgc.com/professional-learning-assets/professional-learning/v3-imagegen/skin-system/S00-01/pages/S00-01-P01.jpg`
  returns `404 text/html`.
- Local backend contains the missing file:
  `public/professional-learning-assets/professional-learning/v3-imagegen/skin-system/S00-01/pages/S00-01-P01.jpg`.
- Local backend contains 941 JPG files under
  `public/professional-learning-assets/professional-learning/v3-imagegen`.
- The failed directories are untracked in git:
  `customer-speech-system`, `entrance-covers`, `meridian-system`,
  `skin-system`, and `zangfu-system`.

## Prior Working Release

The 2026-06-17 static asset release recorded:

- deployment `dpl_CgGJ8sSKiS4CSH2MPAtjyDV2MWTK`
- production URL `https://ip-rdhwqmffo-a171240s-projects.vercel.app`
- final remote GET `checked 941 JPG, ok 941, failureCount 0`

The production alias has since moved to a newer deployment without the 808
required newly rendered assets.

## Guard Update

Updated backend guard files:

- `scripts/check-backend-release-package.mjs`
- `scripts/required-professional-learning-rendered-assets.json`

The required rendered asset manifest now contains 819 current mini-program
rendered image paths, including:

- `v3-imagegen/skin-system`: 257
- `v3-imagegen/meridian-system`: 240
- `v3-imagegen/zangfu-system`: 208
- `v3-imagegen/customer-speech-system`: 90
- `v3-imagegen/entrance-covers`: 13
- TCM foundation folders: 11

Local verification:

```text
node scripts/check-backend-release-package.mjs
PASS private-copy API routes are in the backend package
PASS voice-coach static assets are in the backend package
PASS professional-learning static assets are in the backend package
PASS backend app package is not a static-only deploy folder
backend release package check passed: 4/4
```

## Required Production Fix

This is a backend static asset production release, not a mini-program code
change.

The release package must include all current backend production code that should
remain live plus:

```text
public/professional-learning-assets/professional-learning/v3-imagegen/customer-speech-system/
public/professional-learning-assets/professional-learning/v3-imagegen/entrance-covers/
public/professional-learning-assets/professional-learning/v3-imagegen/meridian-system/
public/professional-learning-assets/professional-learning/v3-imagegen/skin-system/
public/professional-learning-assets/professional-learning/v3-imagegen/zangfu-system/
scripts/check-backend-release-package.mjs
scripts/required-professional-learning-rendered-assets.json
```

Do not deploy directly from the dirty backend working tree unless the unrelated
dirty API changes are intentionally included in the release manifest.

## Required Checks After Release

Run from the mini-program repo:

```bash
node tools/check-professional-learning-remote-images.js --concurrency 4 --timeout-ms 30000
```

Expected result:

```text
renderedUniqueUrls: 819
failureCount: 0
```

Also spot-check:

```text
GET /professional-learning-assets/professional-learning/v3-imagegen/skin-system/S00-01/pages/S00-01-P01.jpg -> 200 image/jpeg
GET /professional-learning-assets/professional-learning/v3-imagegen/meridian-system/M01/pages/M01-01.jpg -> 200 image/jpeg
GET /professional-learning-assets/professional-learning/v3-imagegen/zangfu-system/Z00/pages/Z00-01.jpg -> 200 image/jpeg
GET /professional-learning-assets/professional-learning/v3-imagegen/entrance-covers/EC01/pages/EC01-P01.jpg -> 200 image/jpeg
GET /professional-learning-assets/professional-learning/v3-imagegen/customer-speech-system/A01/pages/A01-P01.jpg -> 200 image/jpeg
```

## Risk Boundary

- No WeChat mini-program upload was performed in this investigation.
- No Vercel production deploy, promote, or alias change was performed.
- No Supabase production change was performed.
- Current backend dirty API changes remain unrelated to this static-asset fix
  unless a release thread explicitly includes them.
