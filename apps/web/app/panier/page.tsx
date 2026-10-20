'use client';
import Link from 'next/link';
import { useCart } from '@/components/cart';
import { IconMinus, IconPlus, IconTrash } from '@/components/icons';
import { ProductVisual } from '@/components/ProductVisual';
import { formatFcfa, splitTtc } from '@/lib/money';

export default function CartPage() {
  const { lines, ready, totalXof, setQuantity, remove } = useCart();

  if (!ready) return <p className="py-10 text-center text-sable">Chargement du panier…</p>;
  if (lines.length === 0) {
    return (
      <div className="card mx-auto my-8 max-w-md p-8 text-center">
        <h1 className="text-2xl font-bold">Votre panier est vide</h1>
        <p className="mt-2 text-sable">Parcourez nos salons, chambres et bureaux pour trouver votre prochain meuble.</p>
        <Link href="/catalogue" className="btn-primary mt-5">Voir le catalogue</Link>
      </div>
    );
  }

  const { ht, tva } = splitTtc(totalXof);
  return (
    <div className="grid gap-5 py-5 md:grid-cols-[1fr_340px]">
      <section>
        <h1 className="mb-3 text-2xl font-bold">Mon panier</h1>
        <ul className="card divide-y divide-orange-100">
          {lines.map((l) => (
            <li key={l.variantId} className="flex gap-3 p-3">
              <Link href={`/produits/${l.productSlug}`} className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-orange-100">
                <ProductVisual publicId={l.imagePublicId} color={l.color} alt={l.name} size={160} />
              </Link>
              <div className="min-w-0 flex-1">
                <p className="font-display font-bold leading-tight">{l.name}</p>
                <p className="truncate text-sm text-sable">{l.variantLabel}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button type="button" aria-label={`Retirer un ${l.name}`} onClick={() => setQuantity(l.variantId, l.quantity - 1)} className="grid h-8 w-8 place-items-center rounded-full border border-orange-200"><IconMinus /></button>
                    <span className="w-5 text-center font-bold tabular-nums">{l.quantity}</span>
                    <button type="button" aria-label={`Ajouter un ${l.name}`} onClick={() => setQuantity(l.variantId, l.quantity + 1)} className="grid h-8 w-8 place-items-center rounded-full border border-orange-200"><IconPlus /></button>
                  </div>
                  <p className="font-display font-bold tabular-nums">{formatFcfa(l.priceXof * l.quantity)}</p>
                </div>
              </div>
              <button type="button" aria-label={`Supprimer ${l.name}`} onClick={() => remove(l.variantId)} className="self-start p-1 text-sable hover:text-red-700"><IconTrash /></button>
            </li>
          ))}
        </ul>
      </section>

      <aside className="card h-fit space-y-2 p-5">
        <h2 className="text-lg font-bold">Récapitulatif</h2>
        <dl className="space-y-1 text-sm tabular-nums">
          <div className="flex justify-between"><dt>Sous-total HT</dt><dd>{formatFcfa(ht)}</dd></div>
          <div className="flex justify-between"><dt>TVA 18 %</dt><dd>{formatFcfa(tva)}</dd></div>
          <div className="flex justify-between text-sable"><dt>Livraison</dt><dd>calculée à l&apos;étape suivante</dd></div>
          <div className="flex justify-between border-t border-orange-100 pt-2 font-display text-lg font-bold"><dt>Total TTC</dt><dd>{formatFcfa(totalXof)}</dd></div>
        </dl>
        <Link href="/commande" className="btn-primary w-full">Passer la commande</Link>
        <p className="text-center text-xs text-sable">Paiement mobile money ou à la livraison</p>
      </aside>
    </div>
  );
}
