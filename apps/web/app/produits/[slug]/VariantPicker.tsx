'use client';
import { useState } from 'react';
import { AddToCartButton } from '@/components/AddToCartButton';
import { IconMinus, IconPlus } from '@/components/icons';
import { formatFcfa, splitTtc } from '@/lib/money';

interface Variant {
  id: string;
  label: string;
  priceXof: number;
  compareAtXof: number | null;
  available: number;
  color: string | null;
  dimensions: string | null;
}

export function VariantPicker({ variants, product }: { variants: Variant[]; product: { slug: string; name: string; imagePublicId: string | null } }) {
  const [selectedId, setSelectedId] = useState(variants[0].id);
  const [quantity, setQuantity] = useState(1);
  const v = variants.find((x) => x.id === selectedId)!;
  const max = Math.max(0, Math.min(20, v.available));

  return (
    <div className="space-y-4">
      <div>
        <p className="font-display text-3xl font-extrabold tabular-nums">{formatFcfa(v.priceXof)}</p>
        <p className="text-sm text-sable tabular-nums">
          {v.compareAtXof && <span className="mr-2 line-through">{formatFcfa(v.compareAtXof)}</span>}
          dont TVA 18 % : {formatFcfa(splitTtc(v.priceXof).tva)}
        </p>
      </div>

      {variants.length > 1 && (
        <fieldset>
          <legend className="label">Modèle</legend>
          <div className="flex flex-wrap gap-2">
            {variants.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => { setSelectedId(x.id); setQuantity(1); }}
                aria-pressed={x.id === selectedId}
                className={`chip flex items-center gap-2 ${x.id === selectedId ? 'chip-on' : ''}`}
              >
                {x.color && <span className="h-4 w-4 rounded-full border border-white" style={{ background: x.color }} aria-hidden="true" />}
                {x.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {v.dimensions && <p className="text-sm"><span className="font-semibold">Dimensions :</span> {v.dimensions}</p>}

      {max > 0 ? (
        <>
          <div className="card flex items-center justify-between px-4 py-2">
            <span className="font-semibold">Quantité</span>
            <div className="flex items-center gap-3">
              <button type="button" aria-label="Retirer un" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="grid h-9 w-9 place-items-center rounded-full border border-orange-200"><IconMinus /></button>
              <span className="w-6 text-center font-display font-bold tabular-nums" aria-live="polite">{quantity}</span>
              <button type="button" aria-label="Ajouter un" onClick={() => setQuantity((q) => Math.min(max, q + 1))} className="grid h-9 w-9 place-items-center rounded-full border border-orange-200"><IconPlus /></button>
            </div>
          </div>
          {v.available <= 3 && <p className="text-sm font-semibold text-orange-700">Plus que {v.available} en stock</p>}
          <AddToCartButton
            quantity={quantity}
            line={{ variantId: v.id, productSlug: product.slug, name: product.name, variantLabel: v.label, priceXof: v.priceXof, color: v.color, imagePublicId: product.imagePublicId }}
          />
        </>
      ) : (
        <p className="card p-4 font-semibold text-sable">Ce modèle est épuisé. Écrivez-nous sur WhatsApp pour connaître le prochain arrivage.</p>
      )}
    </div>
  );
}
