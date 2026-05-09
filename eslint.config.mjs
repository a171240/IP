import nextCoreWebVitals from "eslint-config-next/core-web-vitals"
import nextTypeScript from "eslint-config-next/typescript"
import reactPlugin from "eslint-plugin-react"

const config = [
  {
    ignores: [
      "mini-program-ui/**",
      "xiaoshouzhushou1/**",
      "提示词/**",
      "提示词 copy/**",
      ".claude/**",
      ".tmp/**",
      "tmp/**",
      "artifacts/**",
      "output/**",
      "tmpshots/**",
      "docx_app_spa.js",
      "node_modules/**",
      "voice-coach-ws/dist/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    plugins: {
      react: reactPlugin,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "react/no-unescaped-entities": "warn",
    },
  },
]

export default config
