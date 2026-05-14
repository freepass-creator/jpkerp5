/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  experimental: {
    optimizePackageImports: ['@phosphor-icons/react', '@radix-ui/react-dialog', '@radix-ui/react-tabs'],
  },
};

export default nextConfig;
