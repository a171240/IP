const { IP_FACTORY_BASE_URL } = require("../../utils/config")
const { request } = require("../../utils/request")

function formatMoneyFen(fen) {
  const n = Number(fen || 0)
  return `${(n / 100).toFixed(0)} 元`
}

function mapStatus(status) {
  if (status === "paid") return { text: "已支付", cls: "tag-success" }
  if (status === "closed") return { text: "已关闭", cls: "" }
  if (status === "failed") return { text: "失败", cls: "" }
  return { text: "待支付", cls: "tag-accent" }
}

function mapGrant(grantStatus) {
  if (grantStatus === "granted") return "权益已开通"
  if (grantStatus === "granting") return "开通中..."
  if (grantStatus === "failed") return "开通失败（可联系客服）"
  if (grantStatus === "pending") return "待开通"
  return ""
}

Page({
  data: {
    orders: [],
    loading: false,
  },

  onShow() {
    this.loadOrders()
  },

  async onPullDownRefresh() {
    await this.loadOrders()
    wx.stopPullDownRefresh()
  },

  async loadOrders() {
    if (this.data.loading) return
    this.setData({ loading: true })

    try {
      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/mp/orders?limit=20",
      })

      if (!res?.ok) {
        throw new Error(res?.error || "加载失败")
      }

      const orders = (res.orders || []).map((o) => {
        const statusInfo = mapStatus(o.status)
        const shortId = (o.out_trade_no || "").slice(-6) || "-"
        const grantText = mapGrant(o.grant_status)
        return {
          ...o,
          shortId,
          statusText: statusInfo.text,
          statusClass: statusInfo.cls,
          amountLabel: formatMoneyFen(o.amount_total),
          grantText,
        }
      })

      this.setData({ orders })
    } catch (error) {
      wx.showToast({ title: error.message || "加载失败", icon: "none" })
    } finally {
      this.setData({ loading: false })
    }
  },

  handleOrderTap(e) {
    const outTradeNo = e.currentTarget.dataset.out || ""
    const order = (this.data.orders || []).find((o) => o.out_trade_no === outTradeNo) || null
    if (!order) return

    wx.showModal({
      title: "订单详情",
      content: `订单号：${order.out_trade_no}\n状态：${order.statusText}\n金额：${order.amountLabel}\n${order.grantText ? `\n${order.grantText}` : ""}`,
      showCancel: false,
    })
  },
})
