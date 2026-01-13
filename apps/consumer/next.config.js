/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    // Prevent bundling undici (Node-only) into client builds
    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        undici: false,
        'node:buffer': false,
        'node:stream': false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
