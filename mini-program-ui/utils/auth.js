const { IP_FACTORY_BASE_URL } = require("./config")

const ACCESS_TOKEN_KEY = "auth_access_token"
const REFRESH_TOKEN_KEY = "auth_refresh_token"
const USER_KEY = "auth_user"

function getAccessToken() {
  return wx.getStorageSync(ACCESS_TOKEN_KEY) || ""
}

function getUser() {
  return wx.getStorageSync(USER_KEY) || null
}

function isLoggedIn() {
  return Boolean(getAccessToken())
}

function saveSession(payload) {
  if (!payload || typeof payload !== "object") return

  const accessToken = payload.access_token || ""
  const refreshToken = payload.refresh_token || ""
  const user = payload.user || null

  if (accessToken) wx.setStorageSync(ACCESS_TOKEN_KEY, accessToken)
  if (refreshToken) wx.setStorageSync(REFRESH_TOKEN_KEY, refreshToken)
  if (user) wx.setStorageSync(USER_KEY, user)
}

function clearSession() {
  wx.removeStorageSync(ACCESS_TOKEN_KEY)
  wx.removeStorageSync(REFRESH_TOKEN_KEY)
  wx.removeStorageSync(USER_KEY)
}

function requestWechatLogin(code, profile) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${IP_FACTORY_BASE_URL}/api/wechat/login`,
      method: "POST",
      data: {
        code,
        nickname: profile?.nickName || "",
        avatar_url: profile?.avatarUrl || "",
      },
      header: {
        "Content-Type": "application/json",
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
          return
        }
        reject(res.data || { error: "login_failed" })
      },
      fail(err) {
        reject(err)
      },
    })
  })
}

function loginWithProfile() {
  return new Promise((resolve, reject) => {
    wx.getUserProfile({
      desc: "用于完善账号资料",
      success(profileRes) {
        wx.login({
          success(loginRes) {
            if (!loginRes.code) {
              reject({ error: "missing_code" })
              return
            }
            requestWechatLogin(loginRes.code, profileRes.userInfo)
              .then((payload) => {
                saveSession(payload)
                resolve(payload)
              })
              .catch(reject)
          },
          fail(err) {
            reject(err)
          },
        })
      },
      fail(err) {
        reject(err)
      },
    })
  })
}

function loginSilent() {
  return new Promise((resolve, reject) => {
    wx.login({
      success(loginRes) {
        if (!loginRes.code) {
          reject({ error: "missing_code" })
          return
        }
        requestWechatLogin(loginRes.code, null)
          .then((payload) => {
            saveSession(payload)
            resolve(payload)
          })
          .catch(reject)
      },
      fail(err) {
        reject(err)
      },
    })
  })
}

function logout() {
  clearSession()
}

module.exports = {
  getAccessToken,
  getUser,
  isLoggedIn,
  loginWithProfile,
  loginSilent,
  logout,
}
