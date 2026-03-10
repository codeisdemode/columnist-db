/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true
  },
  transpilePackages: [
    'columnist-db-core',
    'columnist-db-hooks',
    'columnist-db-plugin-openai-embedding'
  ]
}

export default config

