import Link from 'next/link';
import { CartBadge } from './CartBadge';
import { IconUser } from './icons';

/** En-tête blanc : logo à gauche, liens de service à droite. */
export function Header({ tenantName, signedIn, firstName }: { tenantName: string; signedIn: boolean; firstName?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-orange-100 bg-white" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4">
        <Link href="/" className="flex items-center gap-2.5" aria-label={`${tenantName}, accueil`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon.svg" alt="" width={36} height={36} />
          <span className="font-display text-xl font-extrabold tracking-tight">{tenantName}</span>
        </Link>
        <nav className="ml-6 hidden items-center gap-1 lg:flex" aria-label="Catégories">
          <Link href="/catalogue" className="rounded-full px-3 py-2 text-sm font-semibold hover:bg-orange-50">Tous les meubles</Link>
          <Link href="/catalogue?promo=1" className="rounded-full px-3 py-2 text-sm font-semibold hover:bg-orange-50">Promotions</Link>
          <Link href="/catalogue?categorie=salon" className="rounded-full px-3 py-2 text-sm font-semibold hover:bg-orange-50">Salon</Link>
          <Link href="/catalogue?categorie=chambre" className="rounded-full px-3 py-2 text-sm font-semibold hover:bg-orange-50">Chambre</Link>
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <Link href="/compte" className="hidden rounded-full px-3 py-2 text-sm font-semibold hover:bg-orange-50 md:block">Mes commandes</Link>
          {signedIn ? (
            <Link href="/compte" className="hidden items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold hover:bg-orange-50 md:flex">
              <IconUser className="h-5 w-5" /> {firstName}
            </Link>
          ) : (
            <Link href="/connexion" className="hidden rounded-full bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600 md:block">Se connecter</Link>
          )}
          <CartBadge />
        </div>
      </div>
    </header>
  );
}
