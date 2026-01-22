const { IP_FACTORY_BASE_URL } = require("./config")

const ACCESS_TOKEN_KEY = "auth_access_token"
const REFRESH_TOKEN_KEY = "auth_refresh_token"
const USER_KEY = "auth_user"
const PROFILE_KEY = "auth_profile"

function getAccessToken() {
  return wx.getStorageSync(ACCESS_TOKEN_KEY) || ""
}

function getUser() {
  return wx.getStorageSync(USER_KEY) || null
}

function isLoggedIn() {
  return Boolean(getAccessToken())
}

function normalizeProfile(profile) {
  if (!profile || typeof profile !== "object") return null
  const nickname = profile.nickName || profile.nickname || ""
  const avatarUrl = profile.avatarUrl || profile.avatar_url || ""
  return { nickname, avatarUrl }
}

function mergeUserProfile(user, profile) {
  if (!user && !profile) return null
  if (!user) {
    return {
      user_metadata: {
        nickname: profile?.nickname || "",
        avatar_url: profile?.avatarUrl || "",
      },
    }
  }

  if (!profile) return user

  const metadata = user.user_metadata ? { ...user.user_metadata } : {}
  if (!metadata.nickname && profile.nickname) metadata.nickname = profile.nickname
  if (!metadata.avatar_url && profile.avatarUrl) metadata.avatar_url = profile.avatarUrl

  return { ...user, user_metadata: metadata }
}

function saveSession(payload, profileInput) {
  if (!payload || typeof payload !== "object") return

  const accessToken = payload.access_token || ""
  const refreshToken = payload.refresh_token || ""
  const user = payload.user || null
  const profile = normalizeProfile(profileInput)
  const mergedUser = mergeUserProfile(user, profile)

  if (accessToken) wx.setStorageSync(ACCESS_TOKEN_KEY, accessToken)
  if (refreshToken) wx.setStorageSync(REFRESH_TOKEN_KEY, refreshToken)
  if (mergedUser) wx.setStorageSync(USER_KEY, mergedUser)
  if (profile) wx.setStorageSync(PROFILE_KEY, profile)
}

function clearSession() {
  wx.removeStorageSync(ACCESS_TOKEN_KEY)
  wx.removeStorageSync(REFRESH_TOKEN_KEY)
  wx.removeStorageSync(USER_KEY)
  wx.removeStorageSync(PROFILE_KEY)
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
                saveSession(payload, profileRes.userInfo)
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
  getProfile() {
    return wx.getStorageSync(PROFILE_KEY) || null
  },
  loginWithProfile,
  loginSilent,
  logout,
}
