/** @type {import('next').NextConfig} */
const isProduction = process.env.NODE_ENV === "production"
const isStrictBuild = isProduction || process.env.NEXT_STRICT_BUILD !== "false"

const nextConfig = {
  typescript: {
    ignoreBuildErrors: !isStrictBuild,
  },
  images: {
    // TODO: Remove unoptimized and configure remotePatterns once image domains are known.
    unoptimized: true,
  },
  async headers() {
    return [
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
