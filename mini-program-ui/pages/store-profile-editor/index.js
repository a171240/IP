const { IP_FACTORY_BASE_URL } = require("../../utils/config")
const { request } = require("../../utils/request")

function str(v) {
  return String(v || "").trim()
}

function toInt(v) {
  const n = Number(str(v))
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.floor(n))
}

Page({
  data: {
    id: "",
    draftId: "",
    saving: false,

    name: "",
    city: "",
    district: "",
    landmark: "",
    shopType: "",
    mainOfferName: "",
    mainOfferDurationMin: "",

    promiseNoExtraFee: true,
    promiseNoShrink: true,
    promiseCanRefuse: true,
  },

  onLoad(query) {
    const id = str(query?.id)
    const draftId = str(query?.draftId)
    this.setData({ id, draftId })
    if (id) this.loadProfile(id)
  },

  async loadProfile(id) {
    try {
      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: `/api/mp/store-profiles/${encodeURIComponent(id)}`,
      })
      if (!res?.ok || !res?.profile) throw new Error(res?.error || "加载失败")

      const p = res.profile
      const promises = p.promises || {}
      this.setData({
        name: str(p.name),
        city: str(p.city),
        district: str(p.district),
        landmark: str(p.landmark),
        shopType: str(p.shop_type),
        mainOfferName: str(p.main_offer_name),
        mainOfferDurationMin: p.main_offer_duration_min ? String(p.main_offer_duration_min) : "",
        promiseNoExtraFee: promises.no_extra_fee !== false,
        promiseNoShrink: promises.no_shrink !== false,
        promiseCanRefuse: promises.can_refuse !== false,
      })
    } catch (e) {
      wx.showToast({ title: e.message || "加载失败", icon: "none" })
    }
  },

  onName(e) {
    this.setData({ name: e.detail.value })
  },
  onCity(e) {
    this.setData({ city: e.detail.value })
  },
  onDistrict(e) {
    this.setData({ district: e.detail.value })
  },
  onLandmark(e) {
    this.setData({ landmark: e.detail.value })
  },
  onShopType(e) {
    this.setData({ shopType: e.detail.value })
  },
  onMainOfferName(e) {
    this.setData({ mainOfferName: e.detail.value })
  },
  onMainOfferDurationMin(e) {
    this.setData({ mainOfferDurationMin: e.detail.value })
  },

  onPromiseNoExtraFee(e) {
    this.setData({ promiseNoExtraFee: !!e.detail.value })
  },
  onPromiseNoShrink(e) {
    this.setData({ promiseNoShrink: !!e.detail.value })
  },
  onPromiseCanRefuse(e) {
    this.setData({ promiseCanRefuse: !!e.detail.value })
  },

  async handleSave() {
    if (this.data.saving) return

    const name = str(this.data.name)
    if (!name) {
      wx.showToast({ title: "请填写门店昵称", icon: "none" })
      return
    }

    this.setData({ saving: true })

    try {
      const payload = {
        name,
        city: str(this.data.city),
        district: str(this.data.district),
        landmark: str(this.data.landmark),
        shop_type: str(this.data.shopType),
        main_offer_name: str(this.data.mainOfferName),
        main_offer_duration_min: toInt(this.data.mainOfferDurationMin) || undefined,
        promises: {
          no_extra_fee: !!this.data.promiseNoExtraFee,
          no_shrink: !!this.data.promiseNoShrink,
          can_refuse: !!this.data.promiseCanRefuse,
        },
      }

      let profileId = str(this.data.id)

      if (profileId) {
        const res = await request({
          baseUrl: IP_FACTORY_BASE_URL,
          url: `/api/mp/store-profiles/${encodeURIComponent(profileId)}`,
          method: "PUT",
          data: payload,
        })
        if (!res?.ok || !res?.profile?.id) throw new Error(res?.error || "保存失败")
        profileId = res.profile.id
      } else {
        const res = await request({
          baseUrl: IP_FACTORY_BASE_URL,
          url: "/api/mp/store-profiles",
          method: "POST",
          data: payload,
        })
        if (!res?.ok || !res?.profile?.id) throw new Error(res?.error || "保存失败")
        profileId = res.profile.id
      }

      // Set as current profile for compose page.
      const place = [payload.city, payload.district].filter(Boolean).join(" ")
      const label = `${payload.name}${place ? " · " + place : ""}`
      wx.setStorageSync("xhs_store_profile_id", String(profileId))
      wx.setStorageSync("xhs_store_profile_label", label)

      const draftId = str(this.data.draftId)
      if (!draftId) {
        wx.showToast({ title: "已保存", icon: "success" })
        wx.navigateBack()
        return
      }

      // Generate a customized draft variant (keep the original generic draft).
      const draftRes = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: `/api/mp/xhs/drafts/${encodeURIComponent(draftId)}`,
      })
      if (!draftRes?.ok || !draftRes?.draft) throw new Error(draftRes?.error || "获取草稿失败")

      const d = draftRes.draft
      if (!str(d.topic)) {
        throw new Error("草稿缺少主题，请先在发文页生成一次")
      }
      const genRes = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/mp/xhs/generate-v4",
        method: "POST",
        data: {
          variant_of: draftId,
          contentType: d.content_type || "treatment",
          topic: d.topic || "",
          keywords: d.keywords || "",
          shopName: d.shop_name || "",
          conflictLevel: d.conflict_level || "standard",
          store_profile_id: profileId,
        },
      })

      if (!genRes?.ok || !genRes?.draft?.id) throw new Error(genRes?.error || "生成定制版失败")

      const newDraftId = genRes.draft.id
      wx.setStorageSync("xhs_pending_draft_id", newDraftId)
      wx.switchTab({ url: "/pages/xiaohongshu/index" })
    } catch (e) {
      wx.showToast({ title: e.message || "保存失败", icon: "none" })
    } finally {
      this.setData({ saving: false })
    }
  },
})
