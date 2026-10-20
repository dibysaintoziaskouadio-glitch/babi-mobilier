'use client';
// Barre d'onglets flottante, mobile uniquement.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCart } from './cart';
import { IconBag, IconGrid, IconHome, IconUser } from './icons';

const TABS = [
  { href: '/', label: 'Accueil', Icon: IconHome, match: (p: string) => p === '/' },
  { href: '/catalogue', label: 'Catalogue', Icon: IconGrid, match: (p: string) => p.startsWith('/catalogue') || p.startsWith('/produits') },
  { href: '/panier', label: 'Panier', Icon: IconBag, match: (p: string) => p.startsWith('/panier') || p.startsWith('/commande') },
  { href: '/compte', label: 'Compte', Icon: IconUser, match: (p: string) => p.startsWith('/compte') || p.startsWith('/connexion') },
];

export function TabBar() {
  const pathname = usePathname();
  const { count } = useCart();
  return (
    <nav
      aria-label="Navigation"
      className="fixed inset-x-4 z-40 flex justify-around rounded-full bg-orange-500 px-2 py-2 shadow-lg shadow-orange-900/25 md:hidden"
      style={{ bottom: 'calc(12px + env(safe-area-inset-bottom))' }}
    >
      {TABS.map(({ href, label, Icon, match }) => {
        const active = match(pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`relative flex flex-col items-center gap-0.5 rounded-full px-3 py-1 font-display text-[11px] font-semibold text-white ${active ? 'bg-white/20' : ''}`}
          >
            <Icon />
            {label}
            {href === '/panier' && count > 0 && (
              <span className="absolute right-1 top-0 rounded-full bg-white px-1 text-[10px] font-bold leading-4 text-orange-700">{count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
