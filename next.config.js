/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ["img.clerk.com"],
  },
  async redirects() {
    return [
      {
        source: "/invoice",
        destination: "/trade/new",
        permanent: true,
      },
      {
        source: "/",
        destination: "/trade/new",
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
