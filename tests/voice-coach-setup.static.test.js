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

test("project card flow exposes a starter template and a one-tap sample project", () => {
  const setupSource = read("mini-program-ui/pages/voice-coach/setup/index.js")
  const sceneCardsSource = read("mini-program-ui/pages/voice-coach/scene-cards/index.js")
  const editorSource = read("mini-program-ui/pages/voice-coach/scene-card-editor/index.js")
  const helperSource = read("mini-program-ui/pages/voice-coach/test-scene-card.js")
  const sceneCardsMarkup = read("mini-program-ui/pages/voice-coach/scene-cards/index.wxml")
  const editorMarkup = read("mini-program-ui/pages/voice-coach/scene-card-editor/index.wxml")

  assert.match(setupSource, /ensureTestSceneCard/)
  assert.match(setupSource, /scene-card-editor\/index\?template=starter/)
  assert.match(sceneCardsSource, /ensureTestSceneCard/)
  assert.match(sceneCardsSource, /scene-card-editor\/index\?template=starter/)
  assert.match(editorSource, /template === "starter"/)
  assert.match(editorSource, /handleFillStarterTemplate/)
  assert.match(helperSource, /buildStarterSceneCardDraft/)
  assert.match(helperSource, /TEST_SCENE_CARD_NAME/)
  assert.match(sceneCardsMarkup, /项目启动/)
  assert.match(sceneCardsMarkup, /项目卡/)
  assert.match(editorMarkup, /生成项目训练包/)
  assert.match(editorMarkup, /项目资料/)
  ;[
    "mini-program-ui/pages/voice-coach/index.wxml",
    "mini-program-ui/pages/voice-coach/setup/index.wxml",
    "mini-program-ui/pages/voice-coach/scene-cards/index.wxml",
    "mini-program-ui/pages/voice-coach/scene-card-editor/index.wxml",
    "mini-program-ui/pages/voice-coach/setup-storage.js",
  ].forEach((file) => {
    assert.doesNotMatch(read(file), /场景|场景卡|测试场景|训练场景/, file)
  })
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
