/** @type {import('next').NextConfig} */
const nextConfig = {
  // Le service de paiement CinetPay vit dans apps/api et est compilé par Next.
  transpilePackages: ['@babi/api'],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com' }],
  },
  poweredByHeader: false,
};

export default nextConfig;
