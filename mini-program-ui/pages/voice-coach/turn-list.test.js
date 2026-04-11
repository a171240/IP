const test = require("node:test")
const assert = require("node:assert/strict")

const {
  appendOrMergeTurn,
  dedupeTurns,
  patchTurnById,
  renameTurnId,
  replaceTurnById,
} = require("./turn-list")

test("dedupeTurns keeps the first slot and merges later fields for the same id", () => {
  const turns = dedupeTurns([
    { id: "c1", role: "customer", text: "first", pending: true },
    { id: "c1", audio_url: "https://a.test/1.mp3", pending: false },
  ])

  assert.equal(turns.length, 1)
  assert.deepEqual(turns[0], {
    id: "c1",
    role: "customer",
    text: "first",
    pending: false,
    audio_url: "https://a.test/1.mp3",
  })
})

test("replaceTurnById collapses a local placeholder when the server turn already exists", () => {
  const { turns, updated } = replaceTurnById(
    [
      { id: "local_1", role: "beautician", pending: true, text: "" },
      { id: "srv_1", role: "beautician", status: "accepted", text: "识别中" },
    ],
    "local_1",
    { id: "srv_1", role: "beautician", status: "accepted", text: "识别中" },
  )

  assert.equal(updated, true)
  assert.equal(turns.length, 1)
  assert.equal(turns[0].id, "srv_1")
  assert.equal(turns[0].status, "accepted")
})

test("renameTurnId collapses realtime placeholder ids into a saved turn id", () => {
  const { turns, updated } = renameTurnId(
    [
      { id: "rt_customer_1", role: "customer", text: "你好", pending: true },
      { id: "srv_customer_1", role: "customer", audio_url: "https://a.test/2.mp3" },
    ],
    "rt_customer_1",
    "srv_customer_1",
  )

  assert.equal(updated, true)
  assert.equal(turns.length, 1)
  assert.equal(turns[0].id, "srv_customer_1")
  assert.equal(turns[0].audio_url, "https://a.test/2.mp3")
  assert.equal(turns[0].text, "你好")
})

test("appendOrMergeTurn and patchTurnById never create a second entry for the same id", () => {
  const appended = appendOrMergeTurn(
    [{ id: "b1", role: "beautician", text: "旧文案", pending: true }],
    { id: "b1", status: "asr_ready", text: "新文案", pending: false },
  )

  assert.equal(appended.turns.length, 1)
  assert.equal(appended.turns[0].text, "新文案")

  const patched = patchTurnById(appended.turns, "b1", {
    analysis: { polished: "更自然" },
  })

  assert.equal(patched.updated, true)
  assert.equal(patched.turns.length, 1)
  assert.deepEqual(patched.turns[0].analysis, { polished: "更自然" })
})
