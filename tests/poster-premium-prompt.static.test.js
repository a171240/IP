const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const { existsSync, readFileSync } = require("node:fs")
const { join, dirname, resolve } = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")

const root = process.cwd()
const moduleCache = new Map()

function loadTsModule(filePath) {
  const absolutePath = resolve(filePath)
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports

  const source = readFileSync(absolutePath, "utf8")
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: absolutePath,
  })
  const moduleRef = { exports: {} }
  moduleCache.set(absolutePath, moduleRef)
  const localRequire = (specifier) => {
    if (specifier === "server-only") return {}
    if (specifier.startsWith(".") || specifier.startsWith("@/")) {
      const base = specifier.startsWith("@/") ? join(root, specifier.slice(2)) : resolve(dirname(absolutePath), specifier)
      const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, join(base, "index.ts"), join(base, "index.js")]
      const resolvedPath = candidates.find((candidate) => existsSync(candidate))
      if (resolvedPath && /\.(ts|tsx)$/.test(resolvedPath)) return loadTsModule(resolvedPath)
      if (resolvedPath) return require(resolvedPath)
    }
    return require(specifier)
  }
  const wrapped = vm.runInThisContext(
    `(function (exports, require, module, __filename, __dirname) { ${transpiled.outputText}\n})`,
    { filename: absolutePath },
  )
  wrapped(moduleRef.exports, localRequire, moduleRef, absolutePath, dirname(absolutePath))
  return moduleRef.exports
}

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
  assert.match(result.prompt, /保持清晰主次、稳定对齐和足够呼吸感/)
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

test("poster layout presets expose system wireframes and render into premium prompts", () => {
  const result = runPosterModule(`
    import { existsSync } from "node:fs";
    import { join } from "node:path";
    import { getPosterLayoutPreset, getTemplateLayoutMap, readLayoutReferenceDataUrl } from "./lib/posters/layout-presets.ts";
    import { getPosterTemplate, renderPosterTemplate } from "./lib/posters/templates.ts";

    const preset = getPosterLayoutPreset("card-benefits", "P10");
    const template = getPosterTemplate("P10");
    const rendered = renderPosterTemplate(template, {
      storeName: "椿舍皮肤管理",
      menuTitle: "夏季护理菜单",
      menuItems: "清洁管理 199｜补水护理 168｜舒缓修护 268",
      footerNote: "到店先做皮肤状态沟通",
      _industry: "皮肤管理",
    }, "4:5", { layoutPreset: preset });
    const dataUrl = await readLayoutReferenceDataUrl(preset);
    const map = getTemplateLayoutMap();

    console.log(JSON.stringify({
      presetId: preset.id,
      prompt: rendered.prompt,
      mapP10: map.P10,
      hasReference: Boolean(dataUrl && dataUrl.startsWith("data:image/png;base64,")),
      fileExists: existsSync(join(process.cwd(), "public", preset.publicReferencePath)),
    }));
  `)

  assert.equal(result.presetId, "card-benefits")
  assert.match(result.prompt, /系统版式骨架/)
  assert.match(result.prompt, /卡片权益式/)
  assert.match(result.prompt, /系统版式：卡片权益/)
  assert.ok(result.mapP10.includes("grid-menu"))
  assert.equal(result.hasReference, true)
  assert.equal(result.fileExists, true)
})

test("poster image routes support style reference assets without treating them as logo", () => {
  const generateRoute = readFileSync(join(root, "app/api/mp/posters/generate/route.ts"), "utf8")
  const assetsRoute = readFileSync(join(root, "app/api/mp/posters/assets/route.ts"), "utf8")

  assert.match(generateRoute, /z\.enum\(\["style", "logo", "store", "product", "people"\]\)/)
  assert.match(generateRoute, /assetRefs:\s*z\.array\(assetRefSchema\)\.max\(5\)/)
  assert.match(generateRoute, /layoutPresetId:\s*z\.string\(\)\.trim\(\)\.max\(80\)/)
  assert.match(generateRoute, /resolution:\s*z\.enum\(\["1k"\]\)\.optional\(\)/)
  assert.match(generateRoute, /style:\s*"风格\/版式参考"/)
  assert.match(generateRoute, /风格\/版式参考图只用于学习构图、配色、字体气质、留白比例和高级感/)
  assert.match(generateRoute, /layoutReferencePromptBlock/)
  assert.match(generateRoute, /assetPromptBlock\(validAssetRefs,\s*layoutReferenceDataUrl \? 2 : 1\)/)
  assert.match(generateRoute, /const imageUrls = \[layoutReferenceDataUrl \|\| "", \.\.\.userImageUrls\]\.filter\(Boolean\)/)
  assert.match(generateRoute, /layoutReferenceSource:\s*layoutReferenceDataUrl \? "system-wireframe" : "prompt-only"/)
  assert.match(assetsRoute, /new Set<PosterAssetKind>\(\["style", "logo", "store", "product", "people"\]\)/)
})

test("poster templates endpoint exposes layout presets without requiring user layout uploads", () => {
  const templatesRoute = readFileSync(join(root, "app/api/mp/posters/templates/route.ts"), "utf8")
  const assetsRoute = readFileSync(join(root, "app/api/mp/posters/assets/route.ts"), "utf8")

  assert.match(templatesRoute, /layoutPresets:\s*listPublicPosterLayoutPresets\(\)/)
  assert.match(templatesRoute, /templateLayoutMap:\s*getTemplateLayoutMap\(\)/)
  assert.doesNotMatch(assetsRoute, /"layout"/)
})

test("poster image provider folds negative prompt into the submitted prompt", () => {
  const providerSource = readFileSync(join(root, "lib/posters/gpt-image-2.server.ts"), "utf8")

  assert.match(providerSource, /function buildFullPrompt/)
  assert.match(providerSource, /需要避开的画面问题/)
  assert.match(providerSource, /prompt\.includes\(negativePrompt\)/)
  assert.match(providerSource, /const fullPrompt = buildFullPrompt\(opts\)/)
  assert.match(providerSource, /APIMART_IMAGE_BASE_URL \|\| "https:\/\/api\.apimart\.ai\/v1"/)
  assert.match(providerSource, /process\.env\.APIMART_IMAGE_API_KEY \|\| ""/)
  assert.match(providerSource, /process\.env\.APIMART_API_KEY \|\| ""/)
  assert.match(providerSource, /sharedBaseUrl === baseUrl/)
})

test("poster intake keeps user command out of visible poster copy", () => {
  const {
    buildPosterBrief,
    buildPosterFieldsFromBrief,
    buildPosterPlan,
    sanitizePosterTemplateFields,
  } = loadTsModule(join(root, "lib", "posters", "intake.ts"))

  const profile = {
    id: "store_1",
    name: "椿舍日式美肌",
    shop_type: "皮肤管理",
    main_offer_name: "补水护理",
  }
  const brief = buildPosterBrief({
    profile,
    message: "给我生成一张五一的宣传海报",
  })
  const fields = buildPosterFieldsFromBrief("P02", brief)
  const plan = buildPosterPlan({
    templateId: "P02",
    brief,
    fields,
    message: "给我生成一张五一的宣传海报",
    storeProfileId: "store_1",
  })
  const sanitized = sanitizePosterTemplateFields("P02", {
    storeName: "椿舍日式美肌",
    campaignTitle: "给我生成一张五一的宣传海报",
    subline: "假期也要美美的",
    sellingPoints: "补水｜清洁｜舒缓｜提亮",
    offerText: "到店护理体验礼",
    dateRange: "五一期间",
    _industry: "皮肤管理",
    _businessType: "皮肤管理",
    _storeName: "椿舍日式美肌",
  })

  assert.equal(fields.campaignTitle, "五一焕颜季")
  assert.equal(fields._layoutPresetId, "campaign-motion-x")
  assert.equal(plan.visibleCopy.title, "五一焕颜季")
  assert.equal(plan.hiddenContext.layoutPresetId, "campaign-motion-x")
  assert.match(plan.intent.userCommand, /给我生成一张五一的宣传海报/)
  assert.equal(sanitized.fields.campaignTitle, "五一焕颜季")
  assert.deepEqual(sanitized.sanitizedFields, ["campaignTitle"])
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

test("poster intake recommends expected layout presets for common beauty poster cases", () => {
  const { buildPosterBrief, recommendPosterTemplate } = loadTsModule(join(root, "lib", "posters", "intake.ts"))
  const profile = {
    id: "store_1",
    name: "椿舍皮肤管理",
    shop_type: "皮肤管理",
    main_offer_name: "补水护理",
  }
  const cases = [
    {
      name: "品牌留白",
      message: "给我做一张椿舍皮肤管理的品牌形象海报，要高级感、留白、不要促销。",
      templates: ["P04"],
      layoutPresetId: "editorial-whitespace",
    },
    {
      name: "五一新客",
      message: "五一新客补水 99 元，想要高级一点，不要红黄促销。",
      templates: ["P01", "P02"],
      layoutPresetId: "campaign-motion-x",
    },
    {
      name: "价目菜单",
      message: "做一张皮肤管理价目菜单，补水、清洁、舒缓、提亮四个项目。",
      templates: ["P10"],
      layoutPresetId: "grid-menu",
    },
    {
      name: "避坑封面",
      message: "做一张小红书封面，主题是新客做皮肤管理避坑。",
      templates: ["P08"],
      layoutPresetId: "diagonal-xhs-cover",
    },
    {
      name: "节日祝福",
      message: "端午给老客发一张祝福图，不卖东西，不促销。",
      templates: ["P13"],
      layoutPresetId: "editorial-whitespace",
    },
  ]

  for (const item of cases) {
    const brief = buildPosterBrief({ profile, message: item.message })
    const recommendation = recommendPosterTemplate(brief)
    assert.ok(item.templates.includes(recommendation.templateId), item.name)
    assert.equal(recommendation.layoutPresetId, item.layoutPresetId, item.name)
    assert.ok(recommendation.layoutCandidates.includes(recommendation.layoutPresetId), item.name)
  }
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
