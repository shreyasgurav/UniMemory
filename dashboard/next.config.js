/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    // Exclude undici from webpack processing (Firebase compatibility)
    config.externals = config.externals || [];
    if (isServer) {
      config.externals.push('undici');
    }
    
    // Ignore undici in client-side builds
    config.resolve.alias = {
      ...config.resolve.alias,
      undici: false,
    };
    
    return config;
  },
};

module.exports = nextConfig;
