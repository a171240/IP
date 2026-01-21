const { isLoggedIn, loginSilent } = require("./utils/auth")

App({
  onLaunch() {
    if (!isLoggedIn()) {
      loginSilent().catch(() => {})
    }
  },
})
