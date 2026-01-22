const { QUESTIONS } = require("../../utils/diagnosis-questions")
const { IP_FACTORY_BASE_URL } = require("../../utils/config")
const { request } = require("../../utils/request")

Page({
  data: {
    questions: QUESTIONS,
    currentIndex: 0,
    total: QUESTIONS.length,
    currentQuestion: QUESTIONS[0],
    selectedValues: [],
    answers: {},
    progressPercent: 0,
    isLast: false,
    isSubmitting: false,
  },

  onLoad() {
    this.syncQuestion()
  },

  syncQuestion() {
    const { questions, currentIndex, answers } = this.data
    const currentQuestion = questions[currentIndex]
    const saved = answers[currentQuestion.id]
    const selectedValues = Array.isArray(saved) ? saved : saved ? [saved] : []

    const progressPercent = Math.round(((currentIndex + 1) / questions.length) * 100)

    this.setData({
      currentQuestion,
      selectedValues,
      progressPercent,
      isLast: currentIndex === questions.length - 1,
    })
  },

  handleSelect(e) {
    const value = e.currentTarget.dataset.value
    const { currentQuestion, selectedValues } = this.data

    let nextValues = []
    if (currentQuestion.type === "multiple") {
      if (selectedValues.indexOf(value) > -1) {
        nextValues = selectedValues.filter((item) => item !== value)
      } else {
        nextValues = selectedValues.concat(value)
      }
    } else {
      nextValues = [value]
    }

    this.setData({
      selectedValues: nextValues,
      answers: {
        ...this.data.answers,
        [currentQuestion.id]: currentQuestion.type === "multiple" ? nextValues : value,
      },
    })
  },

  async handleNext() {
    const { selectedValues, currentQuestion, currentIndex, questions } = this.data
    if (!selectedValues.length) {
      wx.showToast({ title: "请选择答案", icon: "none" })
      return
    }

    if (currentIndex < questions.length - 1) {
      this.setData({ currentIndex: currentIndex + 1 }, () => this.syncQuestion())
      return
    }

    await this.submitDiagnosis()
  },

  async submitDiagnosis() {
    const { answers } = this.data
    const industry = answers.q1 || "beauty"

    this.setData({ isSubmitting: true })

    try {
      const response = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/diagnosis",
        method: "POST",
        data: {
          answers,
          industry,
        },
      })

      if (!response?.id) {
        throw new Error(response?.error || "诊断失败")
      }

      wx.setStorageSync("diagnosisId", response.id)
      wx.setStorageSync("diagnosisSummary", response.result || null)

      wx.navigateTo({
        url: `/pages/diagnosis-result/index?id=${response.id}`,
      })
    } catch (error) {
      wx.showToast({ title: error.message || "提交失败", icon: "none" })
    } finally {
      this.setData({ isSubmitting: false })
    }
  },
})
