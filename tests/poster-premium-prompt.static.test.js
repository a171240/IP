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

test("visual style presets render into poster prompts and ordinary posters stay 4:5", () => {
  const result = runPosterModule(`
    import { getPosterTemplate, renderPosterTemplate } from "./lib/posters/templates.ts";
    import { getPosterVisualStylePreset, visualStylePromptBlock } from "./lib/posters/visual-style-presets.ts";

    const template = getPosterTemplate("P06");
    const preset = getPosterVisualStylePreset("train-window-travel-archive", "P06");
    const rendered = renderPosterTemplate(template, {
      storeName: "真实门店",
      cityArea: "真实商圈",
      headline: "新店正式开业",
      openingGift: "到店体验礼",
      dateRange: "6.1 起",
      addressLine: "真实地址",
      _visualStylePresetId: preset.id,
      _visualStylePromptBlock: visualStylePromptBlock(preset),
    }, "4:5");

    console.log(JSON.stringify({
      defaultSize: template.defaultSize,
      canvas: rendered.overlay.canvas,
      prompt: rendered.prompt,
    }));
  `)

  assert.equal(result.defaultSize, "4:5")
  assert.equal(result.canvas.size, "4:5")
  assert.match(result.prompt, /视觉风格预设/)
  assert.match(result.prompt, /巨大圆角高铁车窗式窗洞/)
  assert.match(result.prompt, /原始母提示词只提供画面语言/)
  assert.match(result.prompt, /如果没有提供年份，禁止自行补全年份/)
  assert.match(result.prompt, /禁止补成 2024/)
})

test("visual style catalog keeps original mother-prompt texture and guards synthetic years", () => {
  const result = runPosterModule(`
    import {
      getPosterVisualStylePreset,
      getTemplateVisualStyleCandidateIds,
      inferVisualStylePresetFromText,
      listPosterVisualStylePresets,
      listPublicPosterVisualStylePresets,
      sourceMotherPromptBlock,
      visualStylePromptBlock,
    } from "./lib/posters/visual-style-presets.ts";

    const inferredId = inferVisualStylePresetFromText("要一个压顶大标题的强转化商业广告", "P01");
    const archivedInferredId = inferVisualStylePresetFromText("要巨字建筑黑白结构的门店经营课海报", "P08");
    const headline = getPosterVisualStylePreset(inferredId, "P01");
    const archivedRequested = getPosterVisualStylePreset("monumental-type-architecture", "P08");
    const dark = getPosterVisualStylePreset("dark-glow-signal-poster", "P02");
    const oriental = getPosterVisualStylePreset("oriental-immersive-seasonal-field", "P13");
    const publicPresets = listPublicPosterVisualStylePresets();
    const leakedExampleStyleIds = listPosterVisualStylePresets()
      .filter((preset) => /海底捞|小美|鲁迅|湖南|人民大会堂|十二节气 夏至/.test(visualStylePromptBlock(preset)))
      .map((preset) => preset.id);

    console.log(JSON.stringify({
      inferredId,
      archivedInferredId,
      archivedRequestedId: archivedRequested.id,
      p08CandidateIds: getTemplateVisualStyleCandidateIds("P08"),
      publicCount: publicPresets.length,
      publicIds: publicPresets.map((preset) => preset.id),
      publicHasPromptSource: publicPresets.some((preset) => Boolean(preset.promptSource)),
      headlineMotherPrompt: sourceMotherPromptBlock(headline),
      headlinePrompt: visualStylePromptBlock(headline),
      darkPrompt: visualStylePromptBlock(dark),
      orientalPrompt: visualStylePromptBlock(oriental),
      leakedExampleStyleIds,
    }));
  `)

  assert.equal(result.inferredId, "headline-billboard-commercial")
  assert.equal(result.publicCount, 12)
  assert.ok(result.publicIds.includes("oriental-watercolor-greeting-card"))
  assert.ok(result.publicIds.includes("headline-billboard-commercial"))
  assert.ok(!result.publicIds.includes("monumental-type-architecture"))
  assert.equal(result.publicHasPromptSource, false)
  assert.ok(!result.p08CandidateIds.includes("monumental-type-architecture"))
  assert.notEqual(result.archivedInferredId, "monumental-type-architecture")
  assert.notEqual(result.archivedRequestedId, "monumental-type-architecture")
  assert.deepEqual(result.leakedExampleStyleIds, [])
  assert.match(result.headlineMotherPrompt, /^围绕具体主题内容生成一张竖版商业海报/)
  assert.match(result.headlinePrompt, /压顶式超大粗黑主标题/)
  assert.match(result.headlinePrompt, /轻印刷纸面/)
  assert.match(result.darkPrompt, /深色失焦边缘吞掉画面外圈/)
  assert.match(result.darkPrompt, /时间痕迹/)
  assert.match(result.orientalPrompt, /兼具东方气韵、现代信息设计感与沉浸式空间纵深/)
  assert.match(result.orientalPrompt, /视觉场域/)
  assert.match(result.darkPrompt, /母提示词中提到“年份感标记”“时间痕迹”“metadata”时，只表示版式气质/)
  assert.match(result.darkPrompt, /禁止补成 2024/)
})

test("mother-first poster prompt builder keeps source prompt ahead of business fields", () => {
  const { buildPosterHqPrompt, POSTER_HQ_PROMPT_VERSION } = loadTsModule(join(root, "lib", "posters", "hq-prompt.ts"))
  const { getPosterVisualStylePreset, sourceMotherPromptBlock } = loadTsModule(
    join(root, "lib", "posters", "visual-style-presets.ts")
  )
  const preset = getPosterVisualStylePreset("headline-billboard-commercial", "P01")
  const fields = {
    storeName: "真实门店",
    cityArea: "真实商圈",
    headline: "新客体验",
    sellingPoints: "补水｜舒缓",
    offerText: "99 元",
    dateRange: "6.1 起",
    _industry: "皮肤管理",
    _businessType: "皮肤管理",
  }
  const fieldSources = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      { value, source: key.startsWith("_") ? "system_inferred" : "user_text", visible: !key.startsWith("_"), confidence: "high" },
    ])
  )
  const built = buildPosterHqPrompt({
    templateId: "P01",
    templateTitle: "新客引流",
    visualStylePreset: preset,
    businessTheme: "新客体验",
    visibleFields: fields,
    fieldSources,
    qrState: { hasQr: false, source: "missing", reserveArea: false, compositeRequired: false },
    assetRefs: [],
    size: "4:5",
    overlayPlan: { canvas: { width: 900, height: 1125, size: "4:5" }, slots: [] },
  })
  const result = {
    prompt: built.prompt,
    negativePrompt: built.negativePrompt,
    promptVersion: built.promptVersion,
    expectedVersion: POSTER_HQ_PROMPT_VERSION,
    motherPrompt: sourceMotherPromptBlock(preset),
    diagnostics: built.diagnostics,
  }

  assert.equal(result.promptVersion, "poster-hq-v2-mother-first")
  assert.equal(result.expectedVersion, "poster-hq-v2-mother-first")
  assert.equal(result.prompt.startsWith("【视觉母提示词】\n" + result.motherPrompt.slice(0, 80)), true)
  assert.ok(result.prompt.indexOf("压顶式超大粗黑主标题") < result.prompt.indexOf("【本次业务主题】"))
  assert.doesNotMatch(result.prompt, /门店：真实门店/)
  assert.doesNotMatch(result.prompt, /价格\/权益：99 元/)
  assert.doesNotMatch(result.prompt, /时间：6\.1 起/)
  assert.match(result.prompt, /后合成关键字段：门店、地点\/商圈、价格\/权益、时间/)
  assert.match(result.prompt, /不要在模型图里写具体门店名、价格数字、日期、地址/)
  assert.match(result.prompt, /不要二维码、不要二维码框/)
  assert.match(result.prompt, /没有明确年份时，不要生成任何四位年份/)
  assert.doesNotMatch(result.prompt, /高级美术指导/)
  assert.doesNotMatch(result.prompt, /2024/)
  assert.ok(result.diagnostics.promptLength < 2800)
  assert.match(result.negativePrompt, /随机四位年份/)
  assert.match(result.negativePrompt, /错误价格/)
})

test("poster image routes support visual styles, prompt-only layout, and QR-safe assets", () => {
  const generateRoute = readFileSync(join(root, "app/api/mp/posters/generate/route.ts"), "utf8")
  const assetsRoute = readFileSync(join(root, "app/api/mp/posters/assets/route.ts"), "utf8")
  const hqPromptSource = readFileSync(join(root, "lib/posters/hq-prompt.ts"), "utf8")

  assert.match(generateRoute, /z\.enum\(\["style", "logo", "store", "product", "people", "qr"\]\)/)
  assert.match(generateRoute, /buildPosterHqPrompt/)
  assert.match(generateRoute, /POSTER_HQ_PROMPT_VERSION/)
  assert.match(generateRoute, /visualStylePresetId:\s*z\.string\(\)\.trim\(\)\.max\(80\)/)
  assert.match(generateRoute, /fieldSources:\s*z\.record/)
  assert.match(generateRoute, /qrState:\s*qrStateSchema/)
  assert.match(generateRoute, /assetRefs:\s*z\.array\(assetRefSchema\)\.max\(5\)/)
  assert.match(generateRoute, /layoutPresetId:\s*z\.string\(\)\.trim\(\)\.max\(80\)/)
  assert.match(generateRoute, /layoutReferenceMode:\s*z\.enum\(\["prompt-only", "reference"\]\)/)
  assert.match(generateRoute, /resolution:\s*z\.enum\(\["1k"\]\)\.optional\(\)/)
  assert.match(generateRoute, /style:\s*"风格\/版式参考"/)
  assert.match(generateRoute, /风格\/版式参考图只用于学习构图、配色、字体气质、留白比例和高级感/)
  assert.match(generateRoute, /layoutReferencePromptBlock/)
  assert.match(generateRoute, /assetPromptBlock\(validAssetRefs,\s*layoutReferenceDataUrl \? 2 : 1\)/)
  assert.match(generateRoute, /input\.layoutReferenceMode === "reference"/)
  assert.match(generateRoute, /const imageUrls = \[layoutReferenceDataUrl \|\| "", \.\.\.userImageUrls\]\.filter\(Boolean\)/)
  assert.match(generateRoute, /layoutReferenceSource:\s*layoutReferenceDataUrl \? "system-wireframe" : "prompt-only"/)
  assert.match(generateRoute, /ref\.kind === "qr"/)
  assert.match(generateRoute, /promptVersion/)
  assert.match(hqPromptSource, /poster-hq-v2-mother-first/)
  assert.match(assetsRoute, /new Set<PosterAssetKind>\(\["style", "logo", "store", "product", "people", "qr"\]\)/)
})

test("poster generation preserves real and inferred copy but rejects placeholder defaults", () => {
  const generateRoute = readFileSync(join(root, "app/api/mp/posters/generate/route.ts"), "utf8")

  assert.match(generateRoute, /function shouldKeepPosterField/)
  assert.match(generateRoute, /FIELD_SOURCE_ALIASES/)
  assert.match(generateRoute, /bookingLine:\s*\["cta"\]/)
  assert.match(generateRoute, /giftLine:\s*\["offerText"\]/)
  assert.match(generateRoute, /resolvePosterFieldSources/)
  assert.match(generateRoute, /isPosterTestDefaultValue\(value\)/)
  assert.match(generateRoute, /!state\) return true/)
  assert.match(generateRoute, /MISSING_FIELD_SOURCES\.has\(source\)/)
  assert.match(generateRoute, /return source === "system_inferred"/)
})

test("poster templates expose both requiredFields and fields for schema compatibility", () => {
  const result = runPosterModule(`
    import { getPublicPosterTemplates } from "./lib/posters/templates.ts";
    const p01 = getPublicPosterTemplates().find((template) => template.id === "P01");
    console.log(JSON.stringify({
      requiredFieldsLength: p01.requiredFields.length,
      fieldsLength: p01.fields.length,
      firstRequiredKey: p01.requiredFields[0].key,
      firstFieldKey: p01.fields[0].key,
    }));
  `)

  assert.ok(result.requiredFieldsLength > 0)
  assert.equal(result.fieldsLength, result.requiredFieldsLength)
  assert.equal(result.firstFieldKey, result.firstRequiredKey)
})

test("poster templates endpoint exposes layout and visual style presets without requiring user layout uploads", () => {
  const templatesRoute = readFileSync(join(root, "app/api/mp/posters/templates/route.ts"), "utf8")
  const assetsRoute = readFileSync(join(root, "app/api/mp/posters/assets/route.ts"), "utf8")

  assert.match(templatesRoute, /layoutPresets:\s*listPublicPosterLayoutPresets\(\)/)
  assert.match(templatesRoute, /templateLayoutMap:\s*getTemplateLayoutMap\(\)/)
  assert.match(templatesRoute, /visualStylePresets:\s*listPublicPosterVisualStylePresets\(\)/)
  assert.match(templatesRoute, /templateVisualStyleMap:\s*getTemplateVisualStyleMap\(\)/)
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

test("poster intake extracts spoken store, location, project, price, date, and CTA without LLM", () => {
  const {
    buildPosterBrief,
    buildPosterFieldsFromBrief,
    buildPosterFieldSources,
    getPosterMissingFields,
    recommendPosterTemplate,
  } = loadTsModule(join(root, "lib", "posters", "intake.ts"))

  const message =
    "我在苏州工业园区湖西商圈有一家清禾皮肤管理，想做新客补水体验海报，项目是补水舒缓护理，新客价99元，送一次皮肤状态评估，活动时间6月3日到6月30日，行动号召是预约到店领取，目标是附近25到40岁上班族女性。风格要高级商业海报，不需要二维码。"
  const brief = buildPosterBrief({ profile: null, message })
  const recommendation = recommendPosterTemplate(brief)
  const fields = buildPosterFieldsFromBrief(recommendation.templateId, brief)
  const sources = buildPosterFieldSources({ profile: null, message, fields })
  const missing = getPosterMissingFields({ ...brief, templateId: recommendation.templateId })

  assert.equal(brief.storeName, "清禾皮肤管理")
  assert.equal(brief.cityArea, "苏州工业园区湖西商圈")
  assert.equal(brief.projectName, "补水舒缓护理")
  assert.equal(brief.offerText, "新客价99元")
  assert.equal(brief.dateRange, "6月3日到6月30日")
  assert.equal(brief.cta, "预约到店领取")
  assert.match(brief.audience, /25.*40岁.*女性/)
  assert.ok(["P01", "P02"].includes(recommendation.templateId))
  assert.equal(fields.storeName, "清禾皮肤管理")
  assert.equal(fields.offerText, "新客价99元")
  assert.equal(sources.storeName.source, "user_text")
  assert.equal(sources.offerText.visible, true)
  assert.deepEqual(missing, [])
})

test("poster intake treats time and CTA follow-up as field supplement, not a new campaign title", () => {
  const { buildPosterBrief } = loadTsModule(join(root, "lib", "posters", "intake.ts"))

  const brief = buildPosterBrief({
    profile: null,
    answers: {
      storeName: "清禾皮肤管理",
      cityArea: "苏州工业园区湖西商圈",
      industry: "皮肤管理",
      projectName: "补水舒缓护理",
      campaignTitle: "新客补水体验",
      audience: "附近上班族女性",
      sellingPoints: "补水｜舒缓",
      offerText: "99元",
    },
    message: "活动时间写6月3日到6月30日，行动号召写预约到店领取，地址就是苏州工业园区湖西商圈。信息完整了，直接生成4比5竖版海报。",
  })

  assert.equal(brief.campaignTitle, "新客补水体验")
  assert.equal(brief.dateRange, "6月3日到6月30日")
  assert.equal(brief.cta, "预约到店领取")
  assert.equal(brief.cityArea, "苏州工业园区湖西商圈")
})

test("poster intake keeps user-provided style instead of overwriting it with defaults", () => {
  const intakeSource = readFileSync(join(root, "lib/posters/intake.ts"), "utf8")
  const intakeRoute = readFileSync(join(root, "app/api/mp/posters/intake/route.ts"), "utf8")

  assert.match(intakeSource, /function inferStylePreset/)
  assert.match(intakeSource, /out\.stylePreset \|\|= stylePreset/)
  assert.match(intakeSource, /stylePreset:\s*asText\(answers\.stylePreset\) \|\| style\.stylePreset/)
  assert.match(intakeSource, /visualStylePresetId/)
  assert.match(intakeRoute, /用户说高级感、杂志感、轻奢、极简、温暖、东方、暗场、玻璃、菜单、探店、纸感、线描、压顶、水彩、窄窗/)
  assert.doesNotMatch(intakeRoute, /压顶、水彩、巨字、窄窗/)
  assert.match(intakeRoute, /visualStylePresetMap/)
  assert.match(intakeRoute, /asset_refs:\s*z\.array\(z\.any\(\)\)\.max\(5\)/)
})

test("poster fields do not use template defaults as generation values", () => {
  const {
    buildPosterBrief,
    buildPosterFieldsFromBrief,
    buildPosterFieldSources,
    isPosterTestDefaultValue,
  } = loadTsModule(join(root, "lib", "posters", "intake.ts"))

  const brief = buildPosterBrief({
    profile: null,
    message: "做一张端午祝福图，不卖东西，不促销",
  })
  const fields = buildPosterFieldsFromBrief("P13", brief)
  const fieldSources = buildPosterFieldSources({
    profile: null,
    message: "做一张端午祝福图，不卖东西，不促销",
    fields,
  })

  assert.equal(fields.storeName || "", "")
  assert.equal(fields.signature || "", "")
  assert.equal(isPosterTestDefaultValue("吴江松陵"), true)
  assert.equal(Object.values(fields).includes("吴江万宝"), false)
  assert.equal(Object.values(fields).includes("青禾养生"), false)
  assert.equal(Boolean(fieldSources.blessingTitle?.visible), true)

  const realBrief = buildPosterBrief({
    profile: null,
    answers: {
      storeName: "真实门店",
      cityArea: "吴江松陵",
      industry: "皮肤管理",
      headline: "新客体验",
      audience: "附近顾客",
      sellingPoints: "补水｜舒缓",
      offerText: "99 元",
      dateRange: "本周",
      cta: "预约到店",
    },
  })
  const realFields = buildPosterFieldsFromBrief("P01", realBrief)
  const realSources = buildPosterFieldSources({
    profile: null,
    answers: { cityArea: "吴江松陵" },
    fields: realFields,
  })
  assert.equal(realFields.cityArea, "吴江松陵")
  assert.equal(realSources.cityArea.source, "user_text")
  assert.equal(realSources.cityArea.visible, true)
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
