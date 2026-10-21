/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['puppeteer-core', '@sparticuz/chromium-min'],
  experimental: {
    webpackMemoryOptimizations: true,
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
