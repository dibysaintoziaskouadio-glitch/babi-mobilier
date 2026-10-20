// Photo Cloudinary si disponible, sinon illustration de fauteuil teintée à la couleur de la variante.
export function ProductVisual({ publicId, color, alt, size = 480 }: { publicId: string | null; color: string | null; alt: string; size?: number }) {
  // Photo locale (/produits/xxx.jpg, servie depuis public/)
  if (publicId?.startsWith('/')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={publicId} alt={alt} loading="lazy" decoding="async" width={600} height={600} className="h-full w-full object-cover" />;
  }
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD;
  if (publicId && cloud) {
    // f_auto,q_auto : AVIF/WebP compressé, essentiel en 3G
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`https://res.cloudinary.com/${cloud}/image/upload/f_auto,q_auto,c_fill,w_${size},h_${size}/${publicId}`} alt={alt} loading="lazy" className="h-full w-full object-cover" />;
  }
  return (
    <svg viewBox="0 0 120 110" role="img" aria-label={alt} className="h-full w-3/4" style={{ color: color ?? '#F2700D' }}>
      <path d="M22 58C14 22 40 6 60 6s46 16 38 52z" fill="currentColor" />
      <rect x="12" y="50" width="20" height="30" rx="10" fill="currentColor" />
      <rect x="88" y="50" width="20" height="30" rx="10" fill="currentColor" />
      <rect x="24" y="60" width="72" height="22" rx="11" fill="currentColor" />
      <rect x="24" y="60" width="72" height="22" rx="11" fill="#fff" opacity=".16" />
      <path d="M30 82l-6 22M90 82l6 22M46 82l-2 16M74 82l2 16" stroke="#8A5A2B" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
