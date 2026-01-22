# Findings & Decisions
<!-- 
  WHAT: Your knowledge base for the task. Stores everything you discover and decide.
  WHY: Context windows are limited. This file is your "external memory" - persistent and unlimited.
  WHEN: Update after ANY discovery, especially after 2 view/browser/search operations (2-Action Rule).
-->

## Requirements
<!-- 
  WHAT: What the user asked for, broken down into specific requirements.
  WHY: Keeps requirements visible so you don't forget what you're building.
  WHEN: Fill this in during Phase 1 (Requirements & Discovery).
  EXAMPLE:
    - Command-line interface
    - Add tasks
    - List all tasks
    - Delete tasks
    - Python implementation
-->
<!-- Captured from user request -->
- Build a beauty-industry mini program to operate the existing IP content factory site on mobile.
- Provide Xiaohongshu (RED) content + image one-click generation via an existing finished website.
- Add video generation later (future phase).
- Goal: enable mobile operation and future monetization.
- Platform: WeChat mini program.
- APIs: existing sites provide stable APIs to reuse.
- Monetization: subscription + credits; WeChat in-app closed loop.
- Scale: small user volume now, but should be scalable later.
- Target users: beauty salons/shops (store operators).
- Domain: use https://www.ai-meirong.com/ as the Xiaohongshu site base.
- Add publish feature (Xiaohongshu note publish API) in the delivery plan.
- API config should mirror IP factory (same env model, Supabase/credits setup).
- Text+image generation should call the existing API site's "Nano Banana 2" endpoint (details needed).
- Nano Banana 2 image generation endpoint provided: `https://api.evolink.ai/v1/images/generations` (auth + payload/response still needed).
- Updated `xiaoshouzhushou1` image generation to use Evolink Nano Banana 2 via APIMART config; generate-content/title now read APIMART_BASE_URL + APIMART_API_KEY with fallback to existing keys.

## Research Findings
<!-- 
  WHAT: Key discoveries from web searches, documentation reading, or exploration.
  WHY: Multimodal content (images, browser results) doesn't persist. Write it down immediately.
  WHEN: After EVERY 2 view/browser/search operations, update this section (2-Action Rule).
  EXAMPLE:
    - Python's argparse module supports subcommands for clean CLI design
    - JSON module handles file persistence easily
    - Standard pattern: python script.py <command> [args]
-->
<!-- Key discoveries during exploration -->
- Current project uses Next.js 16 + React 19 + Tailwind CSS 4 (from package.json).
- Supabase is configured as backend/auth/storage (from README).
- Existing WeChat Pay native API endpoints are documented in README (project already has payment hooks).
- API `POST /api/chat` exists for content generation; requires authenticated Supabase user, enforces plan/credits, and streams responses (SSE). Uses APIMart upstream with model env config.
- API `POST /api/diagnosis` stores questionnaire answers, calculates a score, and writes `diagnostic_results`; returns result id and level.
- API `POST /api/diagnosis/generate` streams AI report generation via APIMart; `PUT /api/diagnosis/generate` caches the AI report in `diagnostic_results` (if column exists).
- API `GET /api/prompts?dir=...` lists prompt files; `GET /api/prompts?file=...` previews prompt content; `download=1` returns file download and may consume credits.
- API `GET /api/download/{packId}` returns a pack markdown download; requires login, checks plan permissions, and may consume credits.
- API `GET /api/packs/{packId}/download?file=...` downloads a file within a pack; requires login, checks plan permissions, and may consume credits.
- API `POST /api/wechatpay/native/unified-order` creates a WeChat Native (QR) order; stores `wechatpay_orders` and returns `out_trade_no`, `client_secret`, `code_url`.
- API `POST /api/wechatpay/notify` verifies signature, decrypts callback, updates order status, and attempts to fulfill permissions on success.
- API `GET /api/wechatpay/orders/{outTradeNo}?secret=...` queries order status (with secret); falls back to query WeChat if status not paid.
- API `POST /api/wechatpay/orders/claim` binds an order to the logged-in user using `out_trade_no` + `client_secret`, then attempts fulfillment.
- API `GET /api/wechatpay/products` lists available WeChat Pay products.
- API `GET /api/diagnosis/{id}` fetches stored diagnostic results by UUID if not expired.
- Cloned 小红书 repo `xiaoshouzhushou1` for API mapping; contains many Next.js API routes for content, cover, publish, keywords, and stores.
- `xiaoshouzhushou1/API_QUICK_REFERENCE.md` lists core endpoints such as `/api/generate-card`, `/api/generate-content`, `/api/generate-title`, `/api/rewrite-premium`, `/api/rewrite-female`, `/api/moment`, `/api/reply`, `/api/follow-up`, `/api/invitation`, `/api/vision/analyze`, `/api/vision/extract`, plus system endpoints like `/api/init-db` and `/api/performance`.
- `xiaoshouzhushou1/README.md` describes a Next.js app using AI models via APICore/OpenRouter/Replicate and PostgreSQL; suitable as the Xiaohongshu content generation backend.
- `POST /api/generate-content` expects `{ location, skinType, salonName, slogan }` (slogan required); returns `{ content, success }` and uses APICore/OpenRouter.
- `POST /api/generate-title` expects `{ location, skinType, salonName, slogan }` (slogan required); returns `{ title, success }` and uses APICore/OpenRouter.
- `POST /api/generate-xiaohongshu-cover` expects `{ content, templateId? }`; returns HTML + extracted content + template info and validation; used for Xiaohongshu cover image generation (3:4).
- `POST /api/publish-note` expects `{ title?, content?, coverImageUrl, images?, tags? }`; calls third-party publish API using `XIAOHONGSHU_PUBLISH_API_KEY` and returns publish URL + QR.
- `POST /api/content/smart-generate` expects `{ keyword, storeCode? }`; returns matched service, auto-filled theme/selling points/store info, and brand context.
- `POST /api/content/danger-check` expects `{ content, storeCode? }`; returns keyword risk check results. `GET /api/content/danger-check?action=categories&storeCode=...` returns categories; `GET` with `category` returns keywords in that category.
- `GET /api/keywords/list?category=...&limit=...` returns compliant keywords from Supabase, grouped by category.
- `POST /api/keywords/select-weekly` expects `{ weekNumber, count? }`; selects keywords by distribution rules and persists selection; `GET /api/keywords/select-weekly?weekNumber=...` fetches weekly selections.
- `POST /api/generate-cover-image` expects `{ content, contentType?, location?, skinType?, salonName?, slogan?, includeText?, preExtracted? }`; returns `imageUrl` (Base64 preferred) for cover generation via Gemini.
- `POST /api/generate-card` parses `{ data, style, date, content, type, tags, contentType }` from request body (card-style image/content generation).
- `GET /api/stores/list` returns store profiles from `store_profiles`.
- `GET /api/keywords/combinations?contentType=...&count=...` returns recommended keyword combos for content types (treatment/education/promotion/comparison).
- Consolidated mini program IA for UI: TabBar = 工作台 / IP工厂 / 小红书 / 我的, plus global pages for 登录、诊断、订阅支付、订单。
- UI brief created at `d:\IP网站\mini-program-ui-brief.md`.
- Color system from `app/globals.css` (dark theme): background `#030304`, surface `#0F0F11`, elevated `#141416`, foreground `#FFFFFF`, muted `#A1A1AA`, accent `#8B5CF6`, accent hover `#A78BFA`, success `#10B981`, warning `#F59E0B`, error `#EF4444`, info `#3B82F6`.
- Mini program UI now uses a light glass palette with per-page glow themes; design system color palette documented in `d:\IP网站\mini-program-ui\design-system-colors.md`.
- Added a dedicated Home page (`d:\IP网站\mini-program-ui\pages\home`) to explain the app and provide clear start paths.
- Applied a dark Atelier theme for the IP Factory page to mirror the provided "haute couture" UI style.

## Technical Decisions
<!-- 
  WHAT: Architecture and implementation choices you've made, with reasoning.
  WHY: You'll forget why you chose a technology or approach. This table preserves that knowledge.
  WHEN: Update whenever you make a significant technical choice.
  EXAMPLE:
    | Use JSON for storage | Simple, human-readable, built-in Python support |
    | argparse with subcommands | Clean CLI: python todo.py add "task" |
-->
<!-- Decisions made with rationale -->
| Decision | Rationale |
|----------|-----------|
| WeChat mini program first | Matches target distribution and payment needs. |
| Reuse existing stable APIs with a thin BFF adapter if needed | Faster delivery and lower risk. |
| Subscription + credits with WeChat in-app payment | Aligns with monetization requirement. |
| Async job pipeline for content/image generation | Handles variable latency and future scaling. |

## Issues Encountered
<!-- 
  WHAT: Problems you ran into and how you solved them.
  WHY: Similar to errors in pwf-task_plan.md, but focused on broader issues (not just code errors).
  WHEN: Document when you encounter blockers or unexpected challenges.
  EXAMPLE:
    | Empty file causes JSONDecodeError | Added explicit empty file check before json.load() |
-->
<!-- Errors and how they were resolved -->
| Issue | Resolution |
|-------|------------|
|       |            |

## Resources
<!-- 
  WHAT: URLs, file paths, API references, documentation links you've found useful.
  WHY: Easy reference for later. Don't lose important links in context.
  WHEN: Add as you discover useful resources.
  EXAMPLE:
    - Python argparse docs: https://docs.python.org/3/library/argparse.html
    - Project structure: src/main.py, src/utils.py
-->
<!-- URLs, file paths, API references -->
- d:\IP网站\package.json
- d:\IP网站\README.md
- d:\IP网站\xiaoshouzhushou1
- d:\IP网站\xiaoshouzhushou1\API_QUICK_REFERENCE.md
- d:\IP网站\xiaoshouzhushou1\README.md
- d:\IP网站\mini-program-ui-brief.md

## Visual/Browser Findings
<!-- 
  WHAT: Information you learned from viewing images, PDFs, or browser results.
  WHY: CRITICAL - Visual/multimodal content doesn't persist in context. Must be captured as text.
  WHEN: IMMEDIATELY after viewing images or browser results. Don't wait!
  EXAMPLE:
    - Screenshot shows login form has email and password fields
    - Browser shows API returns JSON with "status" and "data" keys
-->
<!-- CRITICAL: Update after every 2 view/browser operations -->
<!-- Multimodal content must be captured as text immediately -->
-

---
<!-- 
  REMINDER: The 2-Action Rule
  After every 2 view/browser/search operations, you MUST update this file.
  This prevents visual information from being lost when context resets.
-->
*Update this file after every 2 view/browser/search operations*
*This prevents visual information from being lost*
