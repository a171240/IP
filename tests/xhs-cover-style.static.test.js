const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const { readFileSync } = require("node:fs")
const { mkdtempSync } = require("node:fs")
const { join } = require("node:path")
const { tmpdir } = require("node:os")

const root = process.cwd()
const compiledDir = mkdtempSync(join(tmpdir(), "xhs-cover-style-"))
execFileSync(
  process.execPath,
  [
    "./node_modules/typescript/bin/tsc",
    "lib/xhs/beauty-knowledge.ts",
    "--outDir",
    compiledDir,
    "--module",
    "commonjs",
    "--target",
    "es2022",
    "--esModuleInterop",
    "--skipLibCheck",
  ],
  { cwd: root, stdio: "pipe" }
)
const compiledBeautyModule = join(compiledDir, "beauty-knowledge.js").replace(/\\/g, "\\\\")

function runBeautyModule(script) {
  const runnable = script.replace(
    /import \{([^}]+)\} from "\.\/lib\/xhs\/beauty-knowledge\.ts";/,
    `const {$1} = require("${compiledBeautyModule}");`
  )
  const stdout = execFileSync(
    process.execPath,
    ["--eval", runnable],
    { cwd: root, encoding: "utf8" }
  )
  return JSON.parse(stdout.trim())
}

test("hydration list cover rebuilds stale LLM prompt into current brief", () => {
  const result = runBeautyModule(`
    import { buildBeautyContext, normalizeCoverAsset } from "./lib/xhs/beauty-knowledge.ts";

    const ctx = buildBeautyContext({
      contentType: "treatment",
      conflictLevel: "standard",
      topic: "五一补水体验",
      keywords: "",
    });

    const asset = normalizeCoverAsset({
      main: "补水前先看这3点",
      sub: "不红不干，五一安心出门",
      prompt: "画幅比例3:4竖版。\\n【AI视觉风格】\\n风格ID：soft-minimal-poster\\n风格名称：温柔极简海报\\n柔软纸张质感，抽象暖光背景，居中大标题。",
      negative: null,
      styleId: "soft-minimal-poster",
      styleReason: "正文围绕补水体验与皮肤状态修复，语气温和。",
      ctx,
    });

    console.log(JSON.stringify({
      defaultStyle: ctx.coverVisualPlan.id,
      coercedStyle: asset.styleId,
      prompt: asset.prompt,
      negative: asset.negative,
    }));
  `)

  assert.equal(result.coercedStyle, "clean-info-card")
  assert.match(result.prompt, /xhs-cover-brief-v4-text-guard/)
  assert.match(result.prompt, /最终风格：clean-info-card/)
  assert.match(result.prompt, /【Skill视觉Brief】/)
  assert.doesNotMatch(result.prompt, /最终风格：soft-minimal-poster/)
  assert.doesNotMatch(result.prompt, /柔软纸张质感/)
  assert.match(result.negative, /底部引流条/)
  assert.match(result.prompt, /标题区、主视觉区、短标签区/)
  assert.match(result.prompt, /高级小红书封面/)
  assert.doesNotMatch(result.prompt, /commercial mini program/)
  assert.doesNotMatch(result.prompt, /进入小程序/)
  assert.doesNotMatch(result.prompt, /立即进入/)
  assert.doesNotMatch(result.prompt, /关注按钮/)
  assert.doesNotMatch(result.prompt, /私信按钮/)
})

test("warning cover routes to warning poster without stale info-card prompt", () => {
  const result = runBeautyModule(`
    import { buildBeautyContext, normalizeCoverAsset } from "./lib/xhs/beauty-knowledge.ts";

    const ctx = buildBeautyContext({
      contentType: "treatment",
      conflictLevel: "standard",
      topic: "防晒护理",
      keywords: "防晒",
    });

    const asset = normalizeCoverAsset({
      main: "防晒做错脸越糟",
      sub: "先避开这一步",
      prompt: "信息卡、三条清单、圆形小图标、细线分隔。",
      negative: null,
      styleId: "clean-info-card",
      styleReason: "旧版信息卡",
      ctx,
    });

    console.log(JSON.stringify({
      style: asset.styleId,
      prompt: asset.prompt,
    }));
  `)

  assert.equal(result.style, "contrast-warning-poster")
  assert.match(result.prompt, /最终风格：contrast-warning-poster/)
  assert.match(result.prompt, /克制警示/)
  assert.doesNotMatch(result.prompt, /旧版信息卡/)
  assert.doesNotMatch(result.prompt, /信息卡、三条清单、圆形小图标、细线分隔/)
  assert.match(result.prompt, /短标签区/)
  assert.doesNotMatch(result.prompt, /no human/)
  assert.doesNotMatch(result.prompt, /no checklist/)
})

test("cover prompt strips CTA words from title and subtitle", () => {
  const result = runBeautyModule(`
    import { buildBeautyContext, normalizeCoverAsset } from "./lib/xhs/beauty-knowledge.ts";

    const ctx = buildBeautyContext({
      contentType: "treatment",
      conflictLevel: "standard",
      topic: "防晒护理",
      keywords: "防晒",
    });

    const asset = normalizeCoverAsset({
      main: "收藏这篇防晒避雷",
      sub: "评论区领取护理方案",
      prompt: "",
      negative: null,
      ctx,
    });

    console.log(JSON.stringify({ prompt: asset.prompt }));
  `)

  assert.doesNotMatch(result.prompt, /收藏/)
  assert.doesNotMatch(result.prompt, /评论区/)
  assert.doesNotMatch(result.prompt, /领取/)
  assert.match(result.prompt, /防晒避雷/)
  assert.match(result.prompt, /护理方案/)
})

test("decision-style relax cover is corrected away from ambience-only spa scene", () => {
  const result = runBeautyModule(`
    import { buildBeautyContext, normalizeCoverAsset } from "./lib/xhs/beauty-knowledge.ts";

    const ctx = buildBeautyContext({
      contentType: "treatment",
      conflictLevel: "standard",
      topic: "修丽可面部+肩颈 SPA放松",
      keywords: "肩颈 放松 SPA",
    });

    const asset = normalizeCoverAsset({
      main: "肩颈SPA怎么选",
      sub: "别只看项目名",
      prompt: "",
      negative: null,
      ctx,
    });

    console.log(JSON.stringify({ style: asset.styleId, prompt: asset.prompt, negative: asset.negative }));
  `)

  assert.equal(result.style, "clean-info-card")
  assert.match(result.prompt, /最终风格：clean-info-card/)
  assert.match(result.prompt, /标题区、主视觉区、短标签区/)
  assert.match(result.prompt, /不要把护理床照片铺满整张图后简单压字/)
  assert.match(result.negative, /纯背景加大字/)
})

test("xhs text generation prompt requires store anchor when profile exists", () => {
  const source = readFileSync(join(root, "lib/xhs/generate-v4.server.ts"), "utf8")
  const coverRoute = readFileSync(join(root, "app/api/mp/xhs/generate-cover-image/route.ts"), "utf8")
  const generateRoute = readFileSync(join(root, "app/api/mp/xhs/generate-v4/route.ts"), "utf8")

  assert.match(source, /门店锚点要求/)
  assert.match(source, /正文必须自然出现门店昵称/)
  assert.match(source, /主推项目\/服务.*全文主线/)
  assert.match(source, /拿一家真实门店做样本解释怎么选/)
  assert.match(source, /body 必须出现清楚的门店锚点/)
  assert.match(source, /function ensureStoreAnchor/)
  assert.match(source, /buildStoreAnchorSentence/)
  assert.match(source, /current = ensureStoreAnchor\(current, input\)/)
  assert.match(generateRoute, /function mergeLocalScope/)
  assert.match(generateRoute, /storeProfile\?\.main_offer_name \|\| input\.offerName/)
  assert.match(generateRoute, /mergeLocalScope\(input\.localScope \|\| "", profileLocalScope\(storeProfile\)\)/)
  assert.match(coverRoute, /短标签克制/)
  assert.match(coverRoute, /普通护理房素材图加大字/)
})

test("cover short labels follow body sections instead of a fixed two-point layout", () => {
  const source = readFileSync(join(root, "lib/xhs/generate-v4.server.ts"), "utf8")
  const coverRoute = readFileSync(join(root, "app/api/mp/xhs/generate-cover-image/route.ts"), "utf8")

  assert.match(source, /function extractCoverPointsFromBody/)
  assert.match(source, /cover_points 数量必须和正文核心小节一致/)
  assert.match(coverRoute, /function extractCoverPointsFromContent/)
  assert.match(coverRoute, /严格显示这\$\{coverPoints\.length\}个短标签/)
  assert.match(coverRoute, /数量必须和小节一致/)
  assert.doesNotMatch(coverRoute, /if \(density === "rich"\) return 3\s+return 2/)
})

test("image generation defaults stay single-image and support provider fallbacks", () => {
  const source = readFileSync(join(root, "lib/posters/gpt-image-2.server.ts"), "utf8")
  const mpRoute = readFileSync(join(root, "app/api/mp/xhs/generate-cover-image/route.ts"), "utf8")
  const legacyRoute = readFileSync(join(root, "app/api/xhs/generate-cover-image/route.ts"), "utf8")

  assert.match(source, /"gpt-image-2"/)
  assert.match(source, /EVOLINK_IMAGE_API_KEY/)
  assert.match(source, /EVOLINK_IMAGE_PRIMARY/)
  assert.match(source, /EVOLINK_IMAGE_MODEL/)
  assert.match(source, /EVOLINK_IMAGE_FALLBACK_MODELS/)
  assert.match(source, /gpt-image-2-official/)
  assert.match(source, /n:\s*1/)
  assert.match(source, /APIMART_IMAGE_MAX_RETRIES/)
  assert.match(source, /EVOLINK_IMAGE_MAX_RETRIES/)
  assert.doesNotMatch(source, /Negative prompt/)
  assert.doesNotMatch(source, /APIMART_IMAGE_RESOLUTION \|\| "2k"/)
  assert.match(source, /BASIC_IMAGE_RESOLUTION = "1k"/)
  assert.doesNotMatch(source, /APIMART_IMAGE_ALLOW_PREMIUM_RESOLUTION/)
  assert.doesNotMatch(source, /ALLOWED_IMAGE_RESOLUTIONS/)
  assert.doesNotMatch(source, /gpt-image-1\.5/)
  assert.match(mpRoute, /const resolution = "1k"/)
  assert.match(legacyRoute, /const resolution = "1k"/)
  assert.doesNotMatch(mpRoute, /normalizeResolution\(getTextField\(requestBody, \["resolution"\]/)
  assert.doesNotMatch(legacyRoute, /normalizeResolution\(getTextField\(requestBody, \["resolution"\]/)
  assert.match(mpRoute, /sanitizeCoverReferenceText/)
  assert.match(legacyRoute, /sanitizeCoverReferenceText/)
  assert.match(mpRoute, /主题语境：\$\{compactText\(safeContent/)
  assert.match(legacyRoute, /safeContent \? compactText\(safeContent/)
  assert.match(legacyRoute, /function getCoverPoints/)
  assert.match(legacyRoute, /function strengthenLegacyCoverPrompt/)
  assert.match(legacyRoute, /辅助信息点区和主视觉区/)
  assert.match(legacyRoute, /不要生成单调的氛围背景加大标题/)
  assert.match(legacyRoute, /coverPrompt:\s*prompt/)
})
