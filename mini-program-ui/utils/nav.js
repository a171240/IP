function openXhsCompose(draftId) {
  const id = String(draftId || "").trim()
  if (id) {
    wx.setStorageSync("xhs_pending_draft_id", id)
  }
  wx.switchTab({ url: "/pages/xiaohongshu/index" })
}

function openXhsDrafts() {
  wx.switchTab({ url: "/pages/xhs-drafts/index" })
}

module.exports = {
  openXhsCompose,
  openXhsDrafts,
}

