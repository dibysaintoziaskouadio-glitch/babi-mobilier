import Link from 'next/link';
import type { ProductCard as Card } from '@/lib/catalog';
import { formatFcfa } from '@/lib/money';
import { AddToCartButton } from './AddToCartButton';
import { ProductVisual } from './ProductVisual';
import { RatingBadge } from './RatingBadge';

export function ProductCard({ p }: { p: Card }) {
  const discount = p.compareAtXof ? Math.round((1 - p.priceXof / p.compareAtXof) * 100) : 0;
  return (
    <article className="flex flex-col">
      <Link href={`/produits/${p.slug}`} className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-2xl bg-orange-100">
        {discount > 0 && <span className="absolute left-2 top-2 z-10 rounded-full bg-orange-500 px-2 py-0.5 font-display text-xs font-bold text-white">-{discount} %</span>}
        <ProductVisual publicId={p.imagePublicId} color={p.color} alt={p.name} />
      </Link>
      <div className="flex flex-1 flex-col px-0.5 pt-2.5">
        <p className="text-xs font-semibold text-sable">{p.categoryName}</p>
        <Link href={`/produits/${p.slug}`} className="line-clamp-2 font-display text-[15px] font-bold leading-snug hover:underline">{p.name}</Link>
        <div className="mt-1"><RatingBadge avg={p.ratingAvg} count={p.ratingCount} /></div>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div className="min-w-0">
            {p.compareAtXof && <p className="text-xs text-sable line-through tabular-nums">{formatFcfa(p.compareAtXof)}</p>}
            <p className="font-display text-lg font-extrabold tabular-nums">{formatFcfa(p.priceXof)}</p>
            <p className="text-[11px] text-sable">TVA incluse</p>
          </div>
          {p.defaultVariantId && p.available ? (
            <AddToCartButton
              compact
              line={{ variantId: p.defaultVariantId, productSlug: p.slug, name: p.name, variantLabel: p.defaultVariantLabel, priceXof: p.priceXof, color: p.color, imagePublicId: p.imagePublicId }}
            />
          ) : (
            <span className="text-xs font-semibold text-sable">Épuisé</span>
          )}
        </div>
      </div>
    </article>
  );
}
