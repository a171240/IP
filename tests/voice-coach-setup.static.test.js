const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), "utf8")
}

test("voice coach setup-related pages use bounded internal scroll containers", () => {
  const files = [
    "mini-program-ui/pages/voice-coach/index.wxml",
    "mini-program-ui/pages/voice-coach/setup/index.wxml",
    "mini-program-ui/pages/voice-coach/scene-cards/index.wxml",
    "mini-program-ui/pages/voice-coach/customer-profiles/index.wxml",
    "mini-program-ui/pages/voice-coach/scene-card-editor/index.wxml",
    "mini-program-ui/pages/voice-coach/customer-profile-editor/index.wxml",
  ]

  files.forEach((file) => {
    const source = read(file)
    assert.match(source, /vc-page-scroll-shell/)
    assert.match(source, /<scroll-view class="page-scroll"[\s\S]*scroll-y="true"/)
    assert.match(source, /bounces="false"/)
  })
})

test("setup-related page configs disable native page scrolling", () => {
  const files = [
    "mini-program-ui/pages/voice-coach/index.json",
    "mini-program-ui/pages/voice-coach/setup/index.json",
    "mini-program-ui/pages/voice-coach/scene-cards/index.json",
    "mini-program-ui/pages/voice-coach/customer-profiles/index.json",
    "mini-program-ui/pages/voice-coach/scene-card-editor/index.json",
    "mini-program-ui/pages/voice-coach/customer-profile-editor/index.json",
  ]

  files.forEach((file) => {
    const parsed = JSON.parse(read(file))
    assert.equal(parsed.disableScroll, true, file)
    assert.equal("enablePullDownRefresh" in parsed, false, file)
  })
})

test("setup-related pages lock the outer page viewport to avoid native bounce on device", () => {
  const files = [
    "mini-program-ui/pages/voice-coach/index.wxss",
    "mini-program-ui/pages/voice-coach/setup/index.wxss",
    "mini-program-ui/pages/voice-coach/scene-cards/index.wxss",
    "mini-program-ui/pages/voice-coach/customer-profiles/index.wxss",
    "mini-program-ui/pages/voice-coach/scene-card-editor/index.wxss",
    "mini-program-ui/pages/voice-coach/customer-profile-editor/index.wxss",
  ]

  files.forEach((file) => {
    const source = read(file)
    assert.match(source, /page\s*\{[\s\S]*position:\s*fixed;[\s\S]*overflow:\s*hidden;/s, file)
  })
})

test("setup-related pages trim the shared bottom spacer instead of inheriting chat footer padding", () => {
  const themeSource = read("mini-program-ui/pages/voice-coach/theme.wxss")
  assert.match(
    themeSource,
    /\.vc-home-page \.container,\s*\.vc-setup-page \.container,\s*\.vc-library-page \.container,\s*\.vc-editor-page \.container\s*\{[\s\S]*padding-bottom:\s*calc\(40rpx \+ env\(safe-area-inset-bottom\)\);/s
  )
})

test("project startup stays available while setup carries selected project into the start flow", () => {
  const setupSource = read("mini-program-ui/pages/voice-coach/setup/index.js")
  const setupMarkup = read("mini-program-ui/pages/voice-coach/setup/index.wxml")
  const sceneCardsSource = read("mini-program-ui/pages/voice-coach/scene-cards/index.js")
  const editorSource = read("mini-program-ui/pages/voice-coach/scene-card-editor/index.js")
  const helperSource = read("mini-program-ui/pages/voice-coach/test-scene-card.js")

  assert.doesNotMatch(setupSource, /ensureTestSceneCard/)
  assert.doesNotMatch(setupSource, /handlePickSceneCard/)
  assert.match(setupSource, /getSelectedSceneCard/)
  assert.match(setupSource, /const sceneCard = getSelectedSceneCard\(\)/)
  assert.match(setupSource, /sceneCard,/)
  assert.match(setupSource, /hasSceneCard: Boolean\(setup\.scene_card_id\)/)
  assert.doesNotMatch(setupSource, /saveSelectedSceneCard/)
  assert.doesNotMatch(setupMarkup, /bindtap="handlePickSceneCard"/)
  assert.doesNotMatch(setupMarkup, /bindinput="onLiveNotes"/)
  assert.match(sceneCardsSource, /ensureTestSceneCard/)
  assert.match(sceneCardsSource, /scene-card-editor\/index\?template=starter/)
  assert.match(editorSource, /template === "starter"/)
  assert.match(editorSource, /handleFillStarterTemplate/)
  assert.match(helperSource, /buildStarterSceneCardDraft/)
  assert.match(helperSource, /TEST_SCENE_CARD_NAME/)
})

test("home direct start includes the currently selected project card when present", () => {
  const homeSource = read("mini-program-ui/pages/voice-coach/index.js")
  const chatSource = read("mini-program-ui/pages/voice-coach/chat.js")
  const sessionRouteSource = read("app/api/voice-coach/sessions/route.ts")
  const sessionContextSource = read("lib/voice-coach/session-context.ts")

  assert.match(homeSource, /getSelectedSceneCard/)
  assert.match(homeSource, /const sceneCard = getSelectedSceneCard\(\)/)
  assert.match(homeSource, /sceneCard,/)
  assert.match(homeSource, /hasSceneCard: Boolean\(setup\.scene_card_id\)/)
  assert.match(chatSource, /payload\.customer_profile_id = setup\.customer_profile_id/)
  assert.match(chatSource, /payload\.scene_card_id = setup\.scene_card_id/)
  assert.match(sessionRouteSource, /\.eq\("id", parsed\.data\.customer_profile_id\)/)
  assert.match(sessionRouteSource, /\.eq\("id", parsed\.data\.scene_card_id\)/)
  assert.match(sessionRouteSource, /customer_profile_id: customerProfileResult\.data\?\.id \|\| null/)
  assert.match(sessionRouteSource, /scene_card_id: sceneCardResult\.data\?\.id \|\| null/)
  assert.match(sessionContextSource, /sceneCard \? formatBulletLine/)
})

test("start flow copy treats customer as the only pre-training blocker", () => {
  const homeSource = read("mini-program-ui/pages/voice-coach/index.js")
  const homeMarkup = read("mini-program-ui/pages/voice-coach/index.wxml")
  const setupMarkup = read("mini-program-ui/pages/voice-coach/setup/index.wxml")
  const customerProfilesMarkup = read("mini-program-ui/pages/voice-coach/customer-profiles/index.wxml")
  const sceneCardsMarkup = read("mini-program-ui/pages/voice-coach/scene-cards/index.wxml")
  const sceneCardEditorMarkup = read("mini-program-ui/pages/voice-coach/scene-card-editor/index.wxml")
  const setupStorageSource = read("mini-program-ui/pages/voice-coach/setup-storage.js")

  assert.match(homeSource, /准备顾客并开练/)
  assert.match(homeSource, /直接开练/)
  assert.match(homeMarkup, /startButtonText/)
  assert.match(setupMarkup, /生成模拟顾客并开练/)
  assert.match(customerProfilesMarkup, /模拟顾客/)
  assert.match(sceneCardsMarkup, /项目启动/)
  assert.match(sceneCardEditorMarkup, /项目启动/)
  assert.match(sceneCardEditorMarkup, /项目资料/)
  assert.match(sceneCardEditorMarkup, /生成训练包/)
  assert.match(sceneCardEditorMarkup, /训练重点/)
  assert.doesNotMatch(sceneCardEditorMarkup, /适合推荐给谁|常见拒绝|引导方式|不能乱说/)
  assert.doesNotMatch(sceneCardEditorMarkup, /系统整理结果|后台|字段|兼容|复杂拆解|员工只|后续可以|不需要/)
  assert.doesNotMatch(sceneCardsMarkup, /资料：|专业：|拒绝：|删除/)
  assert.doesNotMatch(setupMarkup, /场景/)
  assert.doesNotMatch(setupStorageSource, /引导方式|常见拒绝|不能乱说/)
  assert.match(setupStorageSource, /推荐切入/)
  assert.match(setupStorageSource, /拒绝处理/)
  assert.match(setupStorageSource, /表达边界/)
  assert.doesNotMatch(homeMarkup + setupMarkup + customerProfilesMarkup, /测试顾客|测试场景|训练配置/)
})

test("voice coach logs use console.log for normal device-visible tracing", () => {
  const chatSource = read("mini-program-ui/pages/voice-coach/chat.js")
  assert.match(chatSource, /function vcLog\(stage, meta = \{\}\) \{\s*const normalized = emitVcDebugLog\("log", stage, meta\)\s*try \{\s*console\.log\(VC_TAG, stage, normalized\)/s)
})

test("voice coach chat exposes an in-page debug panel for preview-based real-device runs", () => {
  const chatSource = read("mini-program-ui/pages/voice-coach/chat.js")
  const chatMarkup = read("mini-program-ui/pages/voice-coach/chat.wxml")

  assert.match(chatSource, /shouldEnableInPageDebug/)
  assert.match(chatSource, /toggleDebugPanel\(\)/)
  assert.match(chatSource, /debugPanelEnabled: false/)
  assert.match(chatSource, /debugPanelEnabled: this\._debugPanelEnabled/)
  assert.match(chatSource, /debugPanelVisible: false/)
  assert.match(chatSource, /return true/)
  assert.match(chatMarkup, /debug-pill/)
  assert.match(chatMarkup, /debug-sheet/)
  assert.match(chatMarkup, /debug-log-scroll/)
})

test("voice coach setup exposes an in-page debug panel for preview-based real-device runs", () => {
  const setupSource = read("mini-program-ui/pages/voice-coach/setup/index.js")
  const setupMarkup = read("mini-program-ui/pages/voice-coach/setup/index.wxml")

  assert.match(setupSource, /function shouldEnableSetupDebug\(\)/)
  assert.match(setupSource, /toggleDebugPanel\(\)/)
  assert.match(setupSource, /debugPanelEnabled:\s*false/)
  assert.match(setupSource, /debugPanelEnabled:\s*this\._debugPanelEnabled/)
  assert.match(setupSource, /debugPanelVisible:\s*false/)
  assert.match(setupMarkup, /debug-pill/)
  assert.match(setupMarkup, /debug-sheet/)
  assert.match(setupMarkup, /debug-log-scroll/)
})
