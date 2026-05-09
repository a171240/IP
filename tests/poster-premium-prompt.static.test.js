const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const { readFileSync } = require("node:fs")
const { join } = require("node:path")

const root = process.cwd()

function runPosterModule(script) {
  const stdout = execFileSync(
    process.execPath,
    ["--no-warnings", "--experimental-strip-types", "--input-type=module", "--eval", script],
    { cwd: root, encoding: "utf8" }
  )
  return JSON.parse(stdout.trim())
}

test("poster template prompt carries premium art direction and user style preset", () => {
  const result = runPosterModule(`
    import { getPosterTemplate, renderPosterTemplate } from "./lib/posters/templates.ts";

    const template = getPosterTemplate("P02");
    const rendered = renderPosterTemplate(template, {
      storeName: "椿舍皮肤管理",
      campaignTitle: "端午宠粉礼",
      subline: "愿你清爽一夏",
      sellingPoints: "补水｜舒缓｜提亮",
      offerText: "老客专属礼",
      dateRange: "端午期间",
      _stylePreset: "端午国风杂志感，参考图风格",
      _constraints: "不要廉价促销，不要红黄大字",
    }, "4:5");

    console.log(JSON.stringify({
      prompt: rendered.prompt,
      negativePrompt: rendered.negativePrompt,
    }));
  `)

  assert.match(result.prompt, /高级美术指导/)
  assert.match(result.prompt, /用户指定风格方向：端午国风杂志感，参考图风格/)
  assert.match(result.prompt, /最多 3 个视觉层级/)
  assert.match(result.prompt, /中文主标题用高端杂志感宋体/)
  assert.match(result.prompt, /低饱和、干净、精致/)
  assert.match(result.prompt, /不要堆满小图标/)
  assert.match(result.prompt, /可见文字/)
  assert.match(result.prompt, /每条逐字出现一次/)
  assert.match(result.prompt, /背景信息，不要写进画面/)
  assert.match(result.prompt, /用户风格方向：端午国风杂志感，参考图风格/)
  assert.match(result.negativePrompt, /Canva模板感/)
  assert.match(result.negativePrompt, /字体混乱/)
})

test("poster image routes support style reference assets without treating them as logo", () => {
  const generateRoute = readFileSync(join(root, "app/api/mp/posters/generate/route.ts"), "utf8")
  const assetsRoute = readFileSync(join(root, "app/api/mp/posters/assets/route.ts"), "utf8")

  assert.match(generateRoute, /z\.enum\(\["style", "logo", "store", "product", "people"\]\)/)
  assert.match(generateRoute, /assetRefs:\s*z\.array\(assetRefSchema\)\.max\(5\)/)
  assert.match(generateRoute, /resolution:\s*z\.enum\(\["1k"\]\)\.optional\(\)/)
  assert.match(generateRoute, /style:\s*"风格\/版式参考"/)
  assert.match(generateRoute, /风格\/版式参考图只用于学习构图、配色、字体气质、留白比例和高级感/)
  assert.match(assetsRoute, /new Set<PosterAssetKind>\(\["style", "logo", "store", "product", "people"\]\)/)
})

test("poster image provider folds negative prompt into the submitted prompt", () => {
  const providerSource = readFileSync(join(root, "lib/posters/gpt-image-2.server.ts"), "utf8")

  assert.match(providerSource, /function buildFullPrompt/)
  assert.match(providerSource, /需要避开的画面问题/)
  assert.match(providerSource, /prompt\.includes\(negativePrompt\)/)
  assert.match(providerSource, /const fullPrompt = buildFullPrompt\(opts\)/)
  assert.match(providerSource, /APIMART_IMAGE_BASE_URL \|\| "https:\/\/api\.apimart\.ai\/v1"/)
  assert.match(providerSource, /process\.env\.APIMART_API_KEY \|\| ""/)
  assert.doesNotMatch(providerSource, /APIMART_IMAGE_API_KEY/)
  assert.doesNotMatch(providerSource, /APIMART_BASE_URL/)
})

test("poster intake keeps user-provided style instead of overwriting it with defaults", () => {
  const intakeSource = readFileSync(join(root, "lib/posters/intake.ts"), "utf8")
  const intakeRoute = readFileSync(join(root, "app/api/mp/posters/intake/route.ts"), "utf8")

  assert.match(intakeSource, /function inferStylePreset/)
  assert.match(intakeSource, /out\.stylePreset \|\|= stylePreset/)
  assert.match(intakeSource, /stylePreset:\s*asText\(answers\.stylePreset\) \|\| style\.stylePreset/)
  assert.match(intakeRoute, /用户说高级感、杂志感、轻奢、极简、温暖、类似某张图/)
  assert.match(intakeRoute, /asset_refs:\s*z\.array\(z\.any\(\)\)\.max\(5\)/)
})

test("non-promotional festival greetings route to a dedicated premium greeting template", () => {
  const result = runPosterModule(`
    import { getPosterTemplate, renderPosterTemplate } from "./lib/posters/templates.ts";

    const template = getPosterTemplate("P13");
    const rendered = renderPosterTemplate(template, {
      storeName: "青禾养生",
      festivalName: "端午",
      blessingTitle: "端午安康",
      blessingSubtitle: "愿你清爽一夏",
      signature: "青禾养生",
      _industry: "养生美容",
      _stylePreset: "温暖克制的端午国风杂志感",
      _constraints: "不卖东西，不做促销",
    }, "4:5");

    console.log(JSON.stringify({
      title: template.title,
      prompt: rendered.prompt,
    }));
  `)
  const intakeSource = readFileSync(join(root, "lib/posters/intake.ts"), "utf8")
  const intakeRoute = readFileSync(join(root, "app/api/mp/posters/intake/route.ts"), "utf8")

  assert.equal(result.title, "节日祝福")
  assert.match(result.prompt, /非促销节日祝福海报/)
  assert.match(result.prompt, /高端品牌节日贺卡/)
  assert.match(result.prompt, /不出现优惠、价格、促销/)
  assert.doesNotMatch(result.prompt, /新客体验 99/)
  assert.match(intakeSource, /P13:\s*\{ stylePreset: "节日祝福杂志感"/)
  assert.match(intakeSource, /祝福.*问候.*安康.*不卖东西.*不促销/)
  assert.match(intakeRoute, /templateId 必须是 P01-P13/)
  assert.match(intakeRoute, /优先选择 P13/)
})
