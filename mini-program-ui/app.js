const { isLoggedIn, loginSilent } = require("./utils/auth")
const { track } = require("./utils/track")

App({
  onLaunch() {
    track("mp_launch")
    const hadSession = isLoggedIn()
    if (hadSession) {
      track("mp_session_resume")
    }

    loginSilent()
      .then(() => track(hadSession ? "mp_session_refresh_success" : "mp_login_silent_success"))
      .catch(() => track(hadSession ? "mp_session_refresh_fail" : "mp_login_silent_fail"))
  },

  onShow() {
    if (isLoggedIn()) {
      loginSilent().catch(() => {})
    }
  },
})
