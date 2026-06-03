# Professional Learning Assets Local Handoff - 2026-06-03

This backend worktree is prepared for professional-learning static asset
preview. It is not a production release manifest.

## Scope

- Backend worktree:
  `/Users/Admin/Documents/.repo-search-private-domain/a171240__IP.worktrees/codex__poster-hq-v1-20260602`
- Branch: `codex/poster-hq-v1-20260602`
- Added only: `public/professional-learning-assets/`
- No API, database, Vercel production, or mini-program upload action was run.

## Asset Package

- Source export command from mini-program worktree:
  `node tools/export-professional-learning-assets.js`
- Source images: 288 files, about 469.9 MB.
- Output images: 288 JPEG files, 900px wide, `ffmpeg -q:v 5`, about 40.4 MB.
- Backend public directory after copy: about 68 MB total.
- Intended remote base URL:
  `https://ip.ipgongchang.xin/professional-learning-assets/professional-learning`

Sample expected URLs after preview/deploy:

```text
https://ip.ipgongchang.xin/professional-learning-assets/professional-learning/v2/dry-skin/01-main.jpg
https://ip.ipgongchang.xin/professional-learning-assets/professional-learning/v2/skin-layers/pages/01-customer_problem.jpg
https://ip.ipgongchang.xin/professional-learning-assets/professional-learning/v2/forbidden-medical-claims/pages/12-practice.jpg
```

## Verification

```text
find public/professional-learning-assets -type f -> 288 files
public/professional-learning-assets -> about 41 MB on disk
sample 12-practice.jpg -> 900x1350, about 174 KB
corepack pnpm build -> pass, existing lint warnings only
vercel preview -> dpl_7C5W5anWKuzLnJ5Zg9nso3mRnsH5, target preview, Ready
```

Preview URL:

```text
https://ip-haqle4l7a-a171240s-projects.vercel.app
```

The preview deployment is protected by Vercel Authentication. Direct unauthenticated
`curl -I` smoke requests to preview asset URLs currently return `401` HTML, not
asset `404`. The production domain still returns `404` for the professional-learning
asset paths because this change has not been promoted or deployed to production.
Chrome can open the preview root page with the logged-in browser profile, but direct
JPG navigation is blocked by the browser client as `ERR_BLOCKED_BY_CLIENT`.
`vercel inspect --format=json` confirms the preview deployment is Ready, but it does
not expose `public/` static asset paths in its output list. Local `vercel build`
was not continued because it would require pulling Vercel project settings and
preview environment files into the worktree.

Release-prep manifest:

```text
docs/release-manifest-2026-06-03-professional-learning-assets-static.md
```

## Next Move

1. Explicitly name a release thread before any production deploy.
2. Production deploy this backend worktree only after the release-prep manifest
   is accepted.
3. Smoke the three production JPG URLs above and confirm `200 image/jpeg`.
4. Only after production URLs return 200 should the mini-program set
   `PROFESSIONAL_LEARNING_ASSET_BASE_URL`.
