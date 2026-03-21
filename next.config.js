/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    esmExternals: "loose",
  },
  reactStrictMode: true,
};

module.exports = nextConfig;
