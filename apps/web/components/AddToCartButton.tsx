'use client';
import { useState } from 'react';
import { useCart, type CartLine } from './cart';
import { IconBag, IconPlus } from './icons';

export function AddToCartButton({ line, quantity = 1, compact = false, variant = 'primary' }: { line: Omit<CartLine, 'quantity'>; quantity?: number; compact?: boolean; variant?: 'primary' | 'ghost' }) {
  const { add } = useCart();
  const [added, setAdded] = useState(false);

  function onClick() {
    add(line, quantity);
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  }

  if (compact) {
    return (
      <button type="button" onClick={onClick} aria-label={`Ajouter ${line.name} au panier`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-orange-500 text-white hover:bg-orange-600">
        {added ? '✓' : <IconPlus />}
      </button>
    );
  }
  return (
    <button type="button" onClick={onClick} className={`${variant === 'ghost' ? 'btn-ghost whitespace-nowrap px-3 py-2.5 text-sm' : 'btn-primary'} w-full`}>
      <IconBag className={variant === 'ghost' ? 'h-4 w-4' : 'h-5 w-5'} />
      {added ? 'Ajouté au panier' : 'Ajouter au panier'}
    </button>
  );
}
