# Task Plan: Beauty Industry Mini Program Strategy
<!-- 
  WHAT: This is your roadmap for the entire task. Think of it as your "working memory on disk."
  WHY: After 50+ tool calls, your original goals can get forgotten. This file keeps them fresh.
  WHEN: Create this FIRST, before starting any work. Update after each phase completes.
-->

## Goal
<!-- 
  WHAT: One clear sentence describing what you're trying to achieve.
  WHY: This is your north star. Re-reading this keeps you focused on the end state.
  EXAMPLE: "Create a Python CLI todo app with add, list, and delete functionality."
-->
Define a practical technical approach to deliver a beauty-industry mini program that reuses the existing IP content factory and Xiaohongshu content generator, with a clear path to add video generation later.

## Current Phase
<!-- 
  WHAT: Which phase you're currently working on (e.g., "Phase 1", "Phase 3").
  WHY: Quick reference for where you are in the task. Update this as you progress.
-->
Phase 4

## Phases
<!-- 
  WHAT: Break your task into 3-7 logical phases. Each phase should be completable.
  WHY: Breaking work into phases prevents overwhelm and makes progress visible.
  WHEN: Update status after completing each phase: pending → in_progress → complete
-->

### Phase 1: Requirements & Discovery
<!-- 
  WHAT: Understand what needs to be done and gather initial information.
  WHY: Starting without understanding leads to wasted effort. This phase prevents that.
-->
- [x] Confirm target mini program platform(s) and distribution plan
- [x] Identify constraints, scope, and monetization goals
- [x] Inventory existing web features/APIs to reuse
- [x] Document findings in pwf-findings.md
- **Status:** complete
<!-- 
  STATUS VALUES:
  - pending: Not started yet
  - in_progress: Currently working on this
  - complete: Finished this phase
-->

### Phase 2: Planning & Structure
<!-- 
  WHAT: Decide how you'll approach the problem and what structure you'll use.
  WHY: Good planning prevents rework. Document decisions so you remember why you chose them.
-->
- [x] Define technical approach (WeChat native mini program; single-domain backend/BFF)
- [x] Define backend integration strategy (reuse Next.js/Supabase APIs + MP-prefixed BFF routes)
- [x] Consolidate mini program flows into TabBar + page list
- [x] Produce UI brief for frontend (Gemini)
- [x] Document decisions with rationale (see docs/DEV_SPEC_MINIPROGRAM.md)
- **Status:** complete

### Phase 3: Implementation (MVP)
<!-- 
  WHAT: Actually build/create/write the solution.
  WHY: This is where the work happens. Break into smaller sub-tasks if needed.
-->
- [x] Build MVP for IP content factory (P7/P8) + Xiaohongshu drafts/library integration
- [x] Implement auth, usage quotas, and billing hooks (shared Supabase Bearer token + credits snapshot)
- [x] Test incrementally (lint/build; MP regress pending DB migration)
- **Status:** in_progress

### Phase 4: Testing & Verification
<!-- 
  WHAT: Verify everything works and meets requirements.
  WHY: Catching issues early saves time. Document test results in pwf-progress.md.
-->
- [ ] Verify requirements met on mobile devices (WeChat DevTools + real device)
- [x] Document test results in pwf-progress.md
- [ ] Fix any issues found (blocked: apply xhs_drafts migration)
- **Status:** in_progress

### Phase 5: Delivery & Roadmap
<!-- 
  WHAT: Final review and handoff to user.
  WHY: Ensures nothing is forgotten and deliverables are complete.
-->
- [ ] Review deliverables (MVP + roadmap)
- [ ] Document Phase-2: video generation integration plan
- [ ] Deliver summary and next steps
- **Status:** pending

## Key Questions
<!-- 
  WHAT: Important questions you need to answer during the task.
  WHY: These guide your research and decision-making. Answer them as you go.
  EXAMPLE: 
    1. Should tasks persist between sessions? (Yes - need file storage)
    2. What format for storing tasks? (JSON file)
-->
1. Platform: WeChat mini program first.
2. APIs: existing websites provide stable APIs; add a BFF/adapter only if needed.
3. Monetization: subscription + credits via WeChat in-app closed loop.
4. Scale: small user volume now; architecture should allow scaling later.
5. Nano Banana 2 API: image endpoint is `https://api.evolink.ai/v1/images/generations`; need auth + request/response format and confirm if text generation uses a different API.

## Decisions Made
<!-- 
  WHAT: Technical and design decisions you've made, with the reasoning behind them.
  WHY: You'll forget why you made choices. This table helps you remember and justify decisions.
  WHEN: Update whenever you make a significant choice (technology, approach, structure).
  EXAMPLE:
    | Use JSON for storage | Simple, human-readable, built-in Python support |
-->
| Decision | Rationale |
|----------|-----------|
| WeChat mini program first | Aligns with distribution and payment requirements. |
| Reuse existing APIs with a thin adapter if needed | Faster delivery with lower integration risk. |
| Subscription + credits via WeChat in-app pay | Matches monetization requirement. |
| Plan for async generation pipeline | Supports future scaling and video generation. |
| Reuse `/api/chat`, `/api/prompts`, `/api/diagnosis`, and pack download APIs | Existing endpoints already handle auth/credits and content workflows. |
| Add mini program payment flow (JSAPI) while reusing order/fulfillment tables | Current endpoints are Native QR; mini program needs JSAPI. |
| Single domain for mini program: https://ip.ipgongchang.xin | ICP备案约束; mini program request domain whitelist. |
| Include publish feature in MVP flow | User explicitly requested publish. |
| Switch Xiaohongshu generation endpoints to APIMART_* config | Aligns with IP factory API settings and Evolink base. |

## Errors Encountered
<!-- 
  WHAT: Every error you encounter, what attempt number it was, and how you resolved it.
  WHY: Logging errors prevents repeating the same mistakes. This is critical for learning.
  WHEN: Add immediately when an error occurs, even if you fix it quickly.
  EXAMPLE:
    | FileNotFoundError | 1 | Check if file exists, create empty list if not |
    | JSONDecodeError | 2 | Handle empty file case explicitly |
-->
| Error | Attempt | Resolution |
|-------|---------|------------|
| Get-Content failed for `app\\api\\download\\[packId]\\route.ts` (PowerShell treated brackets as wildcard) | 1 | Use `-LiteralPath` or escape brackets when reading files |
| PowerShell parser error when writing page JSON string (bad quote escaping) | 1 | Switch to ConvertTo-Json to generate `index.json` content |
| WeChat DevTools JSON parse error: `Unexpected token ﻿` in `app.json` | 1 | Rewrite JSON files as UTF-8 without BOM |
| PowerShell parser errors when quoting WXML class replacement / rg command | 1 | Use single quotes or string concatenation for literal `"` |
| WXSS compile error: `unexpected token *` | 1 | Removed global `*` selector; replaced with element list for `box-sizing` |
| apply_patch failed to match WXML (BOM at start of file) | 1 | Switched to PowerShell replace and wrote UTF-8 without BOM |

## Notes
<!-- 
  REMINDERS:
  - Update phase status as you progress: pending → in_progress → complete
  - Re-read this plan before major decisions (attention manipulation)
  - Log ALL errors - they help avoid repetition
  - Never repeat a failed action - mutate your approach instead
-->
- Update phase status as you progress: pending → in_progress → complete
- Re-read this plan before major decisions (attention manipulation)
- Log ALL errors - they help avoid repetition
