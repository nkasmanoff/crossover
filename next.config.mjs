/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // The shared pipeline code in /src uses explicit ".js" import specifiers
    // (for tsx/ESM). Teach webpack to resolve those to the ".ts" sources so the
    // app can reuse the exact same Graph/types as the ingester.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
