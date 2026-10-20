import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Image Docker autonome pour Google Cloud Run (voir Dockerfile à la racine).
  output: 'standalone',
  experimental: {
    // Monorepo : les dépendances sont dans le node_modules racine.
    outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  },
  // Le service de paiement CinetPay vit dans apps/api et est compilé par Next.
  transpilePackages: ['@babi/api'],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com' }],
  },
  poweredByHeader: false,
};

export default nextConfig;
