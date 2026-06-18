const test = require("node:test")
const assert = require("node:assert/strict")
const { readFileSync } = require("node:fs")
const { join, dirname } = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")

const root = process.cwd()

function loadTsModule(filePath) {
  const source = readFileSync(filePath, "utf8")
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filePath,
  })
  const moduleRef = { exports: {} }
  const localRequire = (specifier) => {
    if (specifier === "server-only") return {}
    return require(specifier)
  }
  const wrapped = vm.runInThisContext(
    `(function (exports, require, module, __filename, __dirname) { ${transpiled.outputText}\n})`,
    { filename: filePath },
  )
  wrapped(moduleRef.exports, localRequire, moduleRef, filePath, dirname(filePath))
  return moduleRef.exports
}

test("poster template prompt carries premium art direction and user style preset", () => {
  const { getPosterTemplate, renderPosterTemplate } = loadTsModule(join(root, "lib", "posters", "templates.ts"))
  const template = getPosterTemplate("P02")
  const rendered = renderPosterTemplate(
    template,
    {
      storeName: "椿舍皮肤管理",
      campaignTitle: "端午宠粉礼",
      subline: "愿你清爽一夏",
      sellingPoints: "补水｜舒缓｜提亮",
      offerText: "老客专属礼",
      dateRange: "端午期间",
      _stylePreset: "端午国风杂志感，参考图风格",
      _constraints: "不要廉价促销，不要红黄大字",
    },
    "4:5",
    {
      layoutPresetId: "card-benefits",
      visualStylePresetId: "warm-campaign-card",
    },
  )
  const result = {
    prompt: rendered.prompt,
    negativePrompt: rendered.negativePrompt,
  }

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
  assert.match(result.prompt, /【版式预设】/)
  assert.match(result.prompt, /卡片权益/)
  assert.match(result.prompt, /【视觉风格预设】/)
  assert.match(result.prompt, /温柔活动卡/)
  assert.match(result.negativePrompt, /Canva模板感/)
  assert.match(result.negativePrompt, /字体混乱/)
  assert.match(result.negativePrompt, /爆炸贴纸/)
})

test("poster image routes support style reference assets without treating them as logo", () => {
  const generateRoute = readFileSync(join(root, "app/api/mp/posters/generate/route.ts"), "utf8")
  const assetsRoute = readFileSync(join(root, "app/api/mp/posters/assets/route.ts"), "utf8")

  assert.match(generateRoute, /z\.enum\(\["style", "logo", "store", "product", "people", "qr"\]\)/)
  assert.match(generateRoute, /assetRefs:\s*z\.array\(assetRefSchema\)\.max\(6\)/)
  assert.match(generateRoute, /resolution:\s*z\.enum\(\["1k"\]\)\.optional\(\)/)
  assert.match(generateRoute, /style:\s*"风格\/版式参考"/)
  assert.match(generateRoute, /风格\/版式参考图只用于学习构图、配色、字体气质、留白比例和高级感/)
  assert.match(generateRoute, /if \(ref\.kind === "qr"\) continue/)
  assert.match(assetsRoute, /new Set<PosterAssetKind>\(\["style", "logo", "store", "product", "people", "qr"\]\)/)
})

test("poster backend exposes and preserves layout, visual style, and QR protocol fields", () => {
  const {
    getPosterTemplate,
    getPosterTemplateLayoutMap,
    getPosterTemplateVisualStyleMap,
    getPublicPosterLayoutPresets,
    getPublicPosterVisualStylePresets,
    renderPosterTemplate,
  } = loadTsModule(join(root, "lib", "posters", "templates.ts"))
  const templatesRoute = readFileSync(join(root, "app/api/mp/posters/templates/route.ts"), "utf8")
  const generateRoute = readFileSync(join(root, "app/api/mp/posters/generate/route.ts"), "utf8")
  const historyRoute = readFileSync(join(root, "app/api/mp/posters/history/route.ts"), "utf8")

  assert.ok(getPublicPosterLayoutPresets().some((preset) => preset.id === "editorial-whitespace"))
  assert.ok(getPublicPosterVisualStylePresets().some((preset) => preset.id === "frosted-glass-archive-cover"))
  assert.deepEqual(getPosterTemplateLayoutMap().P01.slice(0, 2), ["editorial-whitespace", "center-square-brand"])
  assert.equal(getPosterTemplateVisualStyleMap().P01[0], "frosted-glass-archive-cover")

  const rendered = renderPosterTemplate(
    getPosterTemplate("P01"),
    {
      storeName: "云朵美容院",
      cityArea: "本地商圈",
      headline: "新客补水体验",
      subline: "99元补水护理",
      projectName: "深层补水护理",
      offerText: "99元",
      trustRules: "扫码预约",
    },
    "4:5",
    {
      layoutPresetId: "editorial-whitespace",
      visualStylePresetId: "frosted-glass-archive-cover",
      qrState: { hasQr: true, reserveArea: true, compositeRequired: true },
    },
  )

  assert.match(rendered.prompt, /雾面玻璃档案封面/)
  assert.match(rendered.prompt, /二维码由小程序在保存时后合成/)
  assert.equal(rendered.layoutPreset.id, "editorial-whitespace")
  assert.equal(rendered.visualStylePreset.id, "frosted-glass-archive-cover")
  assert.match(templatesRoute, /layoutPresets: getPublicPosterLayoutPresets\(\)/)
  assert.match(templatesRoute, /visualStylePresets: getPublicPosterVisualStylePresets\(\)/)
  assert.match(generateRoute, /layoutPresetId:\s*z\.string\(\)/)
  assert.match(generateRoute, /visualStylePresetId:\s*z\.string\(\)/)
  assert.match(generateRoute, /fieldSources:\s*z\.record\(z\.string\(\), fieldSourceSchema\)/)
  assert.match(generateRoute, /qrState:\s*qrStateSchema/)
  assert.match(generateRoute, /const qrAssetRefSchema = assetRefSchema\.refine/)
  assert.match(generateRoute, /qrAssetRef:\s*qrAssetRefSchema/)
  assert.match(generateRoute, /allowMissingFields:\s*z\.boolean\(\)/)
  assert.match(generateRoute, /qrCompositePromptBlock\(qrState\)/)
  assert.match(generateRoute, /layoutPreset,\n\s+visualStylePreset,\n\s+visualStylePresetId/)
  assert.match(historyRoute, /visualStylePresetId: meta\?\.visualStylePresetId/)
  assert.match(historyRoute, /qrAssetRef: meta\?\.qrAssetRef/)
})

test("poster required-field checks do not treat template defaults as supplied input", () => {
  const { getPosterTemplate, getMissingRequiredFields, renderPosterTemplate } = loadTsModule(
    join(root, "lib", "posters", "templates.ts"),
  )
  const template = getPosterTemplate("P13")

  assert.deepEqual(getMissingRequiredFields(template, {}), [
    "storeName",
    "festivalName",
    "blessingTitle",
    "blessingSubtitle",
    "signature",
  ])
  assert.deepEqual(getMissingRequiredFields(template, { storeName: "椿舍日式美肌" }), [
    "festivalName",
    "blessingTitle",
    "blessingSubtitle",
    "signature",
  ])

  const rendered = renderPosterTemplate(template, {}, "4:5")
  assert.match(rendered.prompt, /端午安康/)
})

test("poster generation metadata keeps a request audit for missing-field diagnosis", () => {
  const generateRoute = readFileSync(join(root, "app", "api", "mp", "posters", "generate", "route.ts"), "utf8")

  assert.match(generateRoute, /requestAudit:\s*\{/)
  assert.match(generateRoute, /intakeReady:\s*z\.boolean\(\)/)
  assert.match(generateRoute, /intakeMissingFields:\s*z\.array\(z\.string\(\)/)
  assert.match(generateRoute, /error:\s*"intake_not_ready"/)
  assert.match(generateRoute, /rawFieldKeys:\s*Object\.keys\(input\.fields \|\| \{\}\)/)
  assert.match(generateRoute, /missingRequiredFields/)
  assert.match(generateRoute, /intakeReady:\s*input\.intakeReady/)
  assert.match(generateRoute, /intakeMissingFields:\s*input\.intakeMissingFields/)
  assert.match(generateRoute, /allowMissingFields:\s*input\.allowMissingFields/)
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
  assert.equal(plan.visibleCopy.title, "五一焕颜季")
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
  assert.match(intakeRoute, /asset_refs:\s*z\.array\(z\.any\(\)\)\.max\(6\)/)
})

test("non-promotional festival greetings route to a dedicated premium greeting template", () => {
  const { getPosterTemplate, renderPosterTemplate } = loadTsModule(join(root, "lib", "posters", "templates.ts"))
  const template = getPosterTemplate("P13")
  const rendered = renderPosterTemplate(
    template,
    {
      storeName: "青禾养生",
      festivalName: "端午",
      blessingTitle: "端午安康",
      blessingSubtitle: "愿你清爽一夏",
      signature: "青禾养生",
      _industry: "养生美容",
      _stylePreset: "温暖克制的端午国风杂志感",
      _constraints: "不卖东西，不做促销",
    },
    "4:5",
  )
  const result = {
    title: template.title,
    prompt: rendered.prompt,
  }
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
