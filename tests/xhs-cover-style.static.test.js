const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const { readFileSync } = require("node:fs")
const { join } = require("node:path")

const root = process.cwd()

function runBeautyModule(script) {
  const stdout = execFileSync(
    process.execPath,
    ["--no-warnings", "--experimental-strip-types", "--input-type=module", "--eval", script],
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
  assert.match(result.prompt, /风格ID：clean-info-card/)
  assert.doesNotMatch(result.prompt, /风格ID：soft-minimal-poster/)
  assert.doesNotMatch(result.prompt, /柔软纸张质感/)
  assert.match(result.negative, /底部引流条/)
  assert.match(result.prompt, /底部绝对不要出现导流组件/)
  assert.match(result.prompt, /可以有少量辅助说明或清单/)
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
  assert.match(result.prompt, /高级美业杂志封面感/)
  assert.doesNotMatch(result.prompt, /旧版信息卡/)
  assert.doesNotMatch(result.prompt, /信息卡、三条清单、圆形小图标、细线分隔/)
  assert.match(result.prompt, /可以有少量辅助说明或对比元素/)
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

test("image generation defaults stay single-image on gpt-image-2", () => {
  const source = readFileSync(join(root, "lib/posters/gpt-image-2.server.ts"), "utf8")
  const mpRoute = readFileSync(join(root, "app/api/mp/xhs/generate-cover-image/route.ts"), "utf8")
  const legacyRoute = readFileSync(join(root, "app/api/xhs/generate-cover-image/route.ts"), "utf8")
  const miniProgramUi = readFileSync(join(root, "mini-program-ui/pages/xiaohongshu/index.js"), "utf8")

  assert.match(source, /"gpt-image-2"/)
  assert.doesNotMatch(source, /gpt-image-2-official/)
  assert.doesNotMatch(source, /official_fallback/)
  assert.match(source, /n:\s*1/)
  assert.match(source, /APIMART_IMAGE_MAX_RETRIES \|\| 0/)
  assert.doesNotMatch(source, /Negative prompt/)
  assert.doesNotMatch(source, /APIMART_IMAGE_RESOLUTION \|\| "2k"/)
  assert.doesNotMatch(source, /gpt-image-1\.5/)
  assert.match(mpRoute, /const resolution = normalizeResolution\(""\)/)
  assert.match(legacyRoute, /const resolution = normalizeResolution\(""\)/)
  assert.doesNotMatch(mpRoute, /normalizeResolution\(getTextField\(requestBody, \["resolution"\]/)
  assert.doesNotMatch(legacyRoute, /normalizeResolution\(getTextField\(requestBody, \["resolution"\]/)
  assert.doesNotMatch(miniProgramUi, /resolution:\s*"2k"/)
  assert.doesNotMatch(miniProgramUi, /prompt:\s*coverPrompt/)
  assert.doesNotMatch(miniProgramUi, /negativePrompt/)
  assert.match(mpRoute, /sanitizeCoverReferenceText/)
  assert.match(legacyRoute, /sanitizeCoverReferenceText/)
  assert.match(mpRoute, /safeContent \? compactText\(safeContent/)
  assert.match(legacyRoute, /safeContent \? compactText\(safeContent/)
})
