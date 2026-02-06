const { isLoggedIn, loginSilent } = require("./utils/auth")
const { track } = require("./utils/track")

App({
  onLaunch() {
    track("mp_launch")
    if (!isLoggedIn()) {
      loginSilent()
        .then(() => track("mp_login_silent_success"))
        .catch(() => track("mp_login_silent_fail"))
      return
    }

    track("mp_session_resume")
  },
})
