const { IP_FACTORY_BASE_URL } = require("../../utils/config")
const { request } = require("../../utils/request")
const { track } = require("../../utils/track")

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

Page({
  data: {
    products: [],
    payingId: "",
  },

  onLoad() {
    track("pay_view")
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
    if (this.data.payingId) return

    this.setData({ payingId: productId })

    try {
      track("pay_submit", { productId })
      const product = (this.data.products || []).find((p) => p.id === productId) || null

      const order = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/wechatpay/jsapi/unified-order",
        method: "POST",
        data: { product_id: productId },
      })

      if (!order?.pay) {
        throw new Error(order?.error || "下单失败")
      }

      await new Promise((resolve, reject) => {
        wx.requestPayment({
          ...order.pay,
          success: resolve,
          fail: reject,
        })
      })

      const outTradeNo = order.out_trade_no || ""
      const clientSecret = order.client_secret || ""
      let grantStatus = ""

      if (outTradeNo && clientSecret) {
        // Wait for WeChat to finalize payment; our order query endpoint can also query WeChat as fallback.
        for (let i = 0; i < 8; i += 1) {
          const status = await request({
            baseUrl: IP_FACTORY_BASE_URL,
            url: `/api/wechatpay/orders/${outTradeNo}?secret=${encodeURIComponent(clientSecret)}`,
          }).catch(() => null)

          if (status?.status === "paid") break
          await sleep(1200)
        }

        // Trigger fulfill if notify is delayed.
        const claimed = await request({
          baseUrl: IP_FACTORY_BASE_URL,
          url: "/api/wechatpay/orders/claim",
          method: "POST",
          data: { out_trade_no: outTradeNo, client_secret: clientSecret },
        }).catch(() => null)
        grantStatus = claimed?.grant_status || ""
      }

      track("pay_success", { productId, outTradeNo: outTradeNo || null, grantStatus: grantStatus || null })

      if (grantStatus && grantStatus !== "granted") {
        wx.showToast({ title: "支付成功，权益开通中", icon: "none" })
      } else {
        wx.showToast({ title: product?.isPro ? "Pro 已开通" : "开通成功", icon: "success" })
      }

      wx.switchTab({ url: "/pages/mine/index" })
    } catch (error) {
      const msg = error?.errMsg || error?.message || "支付失败"
      if (typeof msg === "string" && msg.toLowerCase().includes("cancel")) {
        track("pay_cancel", { productId })
        wx.showToast({ title: "已取消", icon: "none" })
      } else {
        track("pay_fail", { productId, message: msg })
        wx.showToast({ title: msg, icon: "none" })
      }
    } finally {
      this.setData({ payingId: "" })
    }
  },
})
