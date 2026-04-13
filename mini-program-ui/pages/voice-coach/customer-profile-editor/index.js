const { IP_FACTORY_BASE_URL } = require("../../../utils/config")
const { request } = require("../../../utils/request")
const { saveSelectedCustomerProfile } = require("../setup-storage")

function safeText(value) {
  return String(value || "").trim()
}

Page({
  data: {
    id: "",
    pickMode: false,
    saving: false,

    name: "",
    ageLabel: "",
    occupation: "",
    personalityTags: "",
    communicationStyle: "",
    coreConcerns: "",
    trustTriggers: "",
    pastExperience: "",
    notes: "",
  },

  onLoad(query) {
    const id = safeText(query && query.id)
    const pickMode = String((query && query.pick) || "") === "1"
    this.setData({ id, pickMode })
    if (id) this.loadProfile(id)
  },

  async loadProfile(id) {
    try {
      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/mp/voice-coach/customer-profiles/" + encodeURIComponent(id),
      })

      if (!res || !res.ok || !res.profile) throw new Error((res && res.error) || "加载失败")

      const profile = res.profile
      this.setData({
        name: safeText(profile.name),
        ageLabel: safeText(profile.age_label),
        occupation: safeText(profile.occupation),
        personalityTags: Array.isArray(profile.personality_tags)
          ? profile.personality_tags.join("\n")
          : safeText(profile.personality_tags),
        communicationStyle: safeText(profile.communication_style),
        coreConcerns: Array.isArray(profile.core_concerns)
          ? profile.core_concerns.join("\n")
          : safeText(profile.core_concerns),
        trustTriggers: Array.isArray(profile.trust_triggers)
          ? profile.trust_triggers.join("\n")
          : safeText(profile.trust_triggers),
        pastExperience: safeText(profile.past_experience),
        notes: safeText(profile.notes),
      })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || "加载失败", icon: "none" })
    }
  },

  onName(e) {
    this.setData({ name: e.detail.value })
  },

  onAgeLabel(e) {
    this.setData({ ageLabel: e.detail.value })
  },

  onOccupation(e) {
    this.setData({ occupation: e.detail.value })
  },

  onPersonalityTags(e) {
    this.setData({ personalityTags: e.detail.value })
  },

  onCommunicationStyle(e) {
    this.setData({ communicationStyle: e.detail.value })
  },

  onCoreConcerns(e) {
    this.setData({ coreConcerns: e.detail.value })
  },

  onTrustTriggers(e) {
    this.setData({ trustTriggers: e.detail.value })
  },

  onPastExperience(e) {
    this.setData({ pastExperience: e.detail.value })
  },

  onNotes(e) {
    this.setData({ notes: e.detail.value })
  },

  async handleSave() {
    if (this.data.saving) return

    const name = safeText(this.data.name)
    if (!name) {
      wx.showToast({ title: "请先填写顾客称呼", icon: "none" })
      return
    }

    const payload = {
      name,
      age_label: safeText(this.data.ageLabel),
      occupation: safeText(this.data.occupation),
      personality_tags: this.data.personalityTags,
      communication_style: safeText(this.data.communicationStyle),
      core_concerns: this.data.coreConcerns,
      trust_triggers: this.data.trustTriggers,
      past_experience: safeText(this.data.pastExperience),
      notes: safeText(this.data.notes),
    }

    this.setData({ saving: true })
    try {
      const id = safeText(this.data.id)
      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: id
          ? "/api/mp/voice-coach/customer-profiles/" + encodeURIComponent(id)
          : "/api/mp/voice-coach/customer-profiles",
        method: id ? "PUT" : "POST",
        data: payload,
      })

      if (!res || !res.ok || !res.profile) throw new Error((res && res.error) || "保存失败")

      saveSelectedCustomerProfile(res.profile)
      wx.showToast({ title: "已保存", icon: "success" })
      wx.navigateBack()
    } catch (err) {
      wx.showToast({ title: (err && err.message) || "保存失败", icon: "none" })
    } finally {
      this.setData({ saving: false })
    }
  },
})
