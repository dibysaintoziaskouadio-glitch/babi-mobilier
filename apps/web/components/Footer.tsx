import Link from 'next/link';

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  { title: 'Catalogue', links: [
    { label: 'Salon', href: '/catalogue?categorie=salon' },
    { label: 'Chambre', href: '/catalogue?categorie=chambre' },
    { label: 'Salle à manger', href: '/catalogue?categorie=salle-a-manger' },
    { label: 'Bureau', href: '/catalogue?categorie=bureau' },
    { label: 'Extérieur', href: '/catalogue?categorie=exterieur' },
  ] },
  { title: 'Votre compte', links: [
    { label: 'Se connecter', href: '/connexion' },
    { label: 'Créer un compte', href: '/inscription' },
    { label: 'Mes commandes', href: '/compte' },
    { label: 'Mon panier', href: '/panier' },
  ] },
  { title: 'Aide', links: [
    { label: 'Livraison et montage', href: '/catalogue' },
    { label: 'Paiement mobile money', href: '/catalogue' },
    { label: 'Retours et garanties', href: '/catalogue' },
  ] },
];

export function Footer({ tenantName }: { tenantName: string }) {
  return (
    <footer className="mt-16 border-t border-orange-100 bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-display text-lg font-extrabold">{tenantName}</p>
          <p className="mt-2 max-w-xs text-sm text-sable">Meubles livrés et montés à Abidjan. Paiement Orange Money, MTN, Moov, Wave ou à la livraison.</p>
        </div>
        {COLUMNS.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <p className="font-display font-bold">{c.title}</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {c.links.map((l) => <li key={l.label}><Link href={l.href} className="text-sable hover:text-orange-700">{l.label}</Link></li>)}
            </ul>
          </nav>
        ))}
      </div>
      <p className="border-t border-orange-100 px-4 py-4 text-center text-xs text-sable">© {new Date().getFullYear()} {tenantName} · Prix en FCFA, TVA 18 % incluse</p>
    </footer>
  );
}
