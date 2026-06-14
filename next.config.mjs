/** @type {import('next').NextConfig} */
process.env.BASELINE_BROWSER_MAPPING_IGNORE_OLD_DATA = "true"
process.env.BROWSERSLIST_IGNORE_OLD_DATA = "true"

const isProduction = process.env.NODE_ENV === "production"
const isStrictBuild = isProduction || process.env.NEXT_STRICT_BUILD !== "false"
const largeLocalOnlyTraceExcludes = [
  "artifacts/**/*",
  "codex-plugin-library/**/*",
  "docs/ui-prototype/**/*",
  "output/**/*",
  "tmp/**/*",
  "tmpshots/**/*",
  "xiaoshouzhushou1/**/*",
  "提示词/**/*",
]

const nextConfig = {
  typescript: {
    ignoreBuildErrors: !isStrictBuild,
  },
  outputFileTracingExcludes: {
    "**": largeLocalOnlyTraceExcludes,
  },
  images: {
    // TODO: Remove unoptimized and configure remotePatterns once image domains are known.
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: "/voice-coach-assets/manbeilian-knowledge/v1/images/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/voice-coach-assets/manbeilian-knowledge/v1/covers/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ]
  },
}

export default nextConfig
