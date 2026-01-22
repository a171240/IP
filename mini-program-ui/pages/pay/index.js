const { IP_FACTORY_BASE_URL } = require("../../utils/config")
const { request } = require("../../utils/request")

Page({
  data: {
    products: [],
    payingId: "",
  },

  onLoad() {
    this.loadProducts()
  },

  async loadProducts() {
    try {
      const response = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/wechatpay/products",
      })

      const products = (response?.products || [])
        .filter(Boolean)
        .map((item) => ({
          ...item,
          priceLabel: `${(item.amount_total / 100).toFixed(0)} 元`,
          isPro: item.plan === "pro",
        }))

      this.setData({ products })
    } catch (error) {
      wx.showToast({ title: error.message || "加载套餐失败", icon: "none" })
    }
  },

  async handlePay(e) {
    const productId = e.currentTarget.dataset.id
    if (!productId) return

    this.setData({ payingId: productId })

    wx.showToast({ title: "支付接口待接入", icon: "none" })
    this.setData({ payingId: "" })
  },
})
