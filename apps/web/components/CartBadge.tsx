'use client';
import Link from 'next/link';
import { useCart } from './cart';
import { IconBag } from './icons';

export function CartBadge() {
  const { count, ready } = useCart();
  return (
    <Link href="/panier" className="relative ml-auto grid h-11 w-11 place-items-center rounded-full border border-orange-200 bg-white md:ml-0" aria-label={`Panier, ${count} article${count > 1 ? 's' : ''}`}>
      <IconBag />
      {ready && count > 0 && (
        <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-orange-500 px-1.5 text-center font-display text-xs font-bold leading-5 text-white">{count}</span>
      )}
    </Link>
  );
}
