import Link from 'next/link';
import type { DeliveryInfo, ProductCard } from '@/lib/catalog';
import { formatFcfa } from '@/lib/money';
import { AddToCartButton } from './AddToCartButton';
import { ProductVisual } from './ProductVisual';
import { RatingBadge } from './RatingBadge';

/** Résultat de recherche en ligne : photo à gauche, détails au centre, prix à droite. */
export function ResultCard({ p, delivery }: { p: ProductCard; delivery: DeliveryInfo | null }) {
  const discount = p.compareAtXof ? Math.round((1 - p.priceXof / p.compareAtXof) * 100) : 0;
  return (
    <article className="card grid overflow-hidden transition hover:shadow-lg hover:shadow-orange-900/5 sm:grid-cols-[260px_1fr]">
      <Link href={`/produits/${p.slug}`} className="relative block aspect-[4/3] bg-orange-100 sm:aspect-auto sm:h-full sm:min-h-[220px]">
        <ProductVisual publicId={p.imagePublicId} color={p.color} alt={p.name} />
        {discount > 0 && <span className="absolute left-3 top-3 rounded-full bg-orange-500 px-2.5 py-1 font-display text-xs font-bold text-white">-{discount} %</span>}
      </Link>

      <div className="flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:p-5">
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">{p.categoryName}</p>
          <h3 className="text-lg font-bold leading-snug">
            <Link href={`/produits/${p.slug}`} className="hover:underline">{p.name}</Link>
          </h3>
          {p.description && <p className="line-clamp-2 text-sm text-sable">{p.description}</p>}
          {p.materials.length > 0 && <p className="text-sm">{p.materials.map((m) => m[0].toUpperCase() + m.slice(1)).join(' · ')}</p>}
          <ul className="space-y-0.5 pt-1 text-sm">
            <li className="font-semibold text-green-700">✓ Paiement à la livraison possible</li>
            <li className="text-green-700">✓ Montage inclus à Abidjan</li>
            {p.available && p.stockLeft > 0 && p.stockLeft <= 3 && <li className="font-semibold text-red-700">Plus que {p.stockLeft} en stock</li>}
          </ul>
          <div className="pt-1"><RatingBadge avg={p.ratingAvg} count={p.ratingCount} /></div>
        </div>

        <div className="flex shrink-0 flex-row items-end justify-between gap-3 border-t border-orange-100 pt-3 sm:w-56 sm:flex-col sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
          <div className="sm:text-right">
            {p.compareAtXof && <p className="text-sm text-sable line-through tabular-nums">{formatFcfa(p.compareAtXof)}</p>}
            <p className="whitespace-nowrap font-display text-2xl font-extrabold tabular-nums">{formatFcfa(p.priceXof)}</p>
            <p className="text-xs text-sable">TVA incluse</p>
            {delivery && (
              <p className="mt-1 text-xs">
                + {formatFcfa(delivery.feeXof)} livraison à {delivery.commune}
                <br />
                <span className="text-sable">sous {delivery.minDays} à {delivery.maxDays} j</span>
              </p>
            )}
          </div>
          <div className="flex w-full max-w-[13rem] flex-col gap-2">
            <Link href={`/produits/${p.slug}`} className="btn-primary py-2.5 text-sm">Voir le meuble</Link>
            {p.defaultVariantId && p.available && (
              <AddToCartButton
                variant="ghost"
                line={{ variantId: p.defaultVariantId, productSlug: p.slug, name: p.name, variantLabel: p.defaultVariantLabel, priceXof: p.priceXof, color: p.color, imagePublicId: p.imagePublicId }}
              />
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
