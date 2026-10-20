import Link from 'next/link';
import { ProductCard } from '@/components/ProductCard';
import { SearchPanel } from '@/components/SearchPanel';
import { categoryCounts, listCategories, listCommunes, listDeals, listProducts } from '@/lib/catalog';
import { getSession } from '@/lib/session';
import { getCurrentTenant } from '@/lib/tenant';

// Photo représentative de chaque pièce (public/produits)
const CATEGORY_PHOTO: Record<string, string> = {
  salon: '/produits/canape-riviera-velours-vert.jpg',
  chambre: '/produits/lit-riviera-golf-160.jpg',
  'salle-a-manger': '/produits/ensemble-repas-emeraude.jpg',
  bureau: '/produits/bureau-plateau.jpg',
  exterieur: '/produits/chaise-jardin-grand-lahou.jpg',
};

const PROMISES = [
  { title: 'Paiement à la livraison', text: 'Vous payez en espèces quand le meuble est chez vous, ou en mobile money à la commande.' },
  { title: 'Livré et monté', text: 'À Abidjan, le livreur vous appelle avant d\'arriver et installe le meuble.' },
  { title: 'Prix TVA incluse', text: 'Le prix affiché est le prix final. Les frais de livraison s\'affichent avant de payer.' },
];

export default async function HomePage() {
  const tenant = await getCurrentTenant();
  const [categories, counts, communes, deals, best, session] = await Promise.all([
    listCategories(tenant.id),
    categoryCounts(tenant.id),
    listCommunes(tenant.id),
    listDeals(tenant.id),
    listProducts(tenant.id, { tri: 'nouveautes' }),
    getSession(),
  ]);

  return (
    <div className="space-y-14 pb-4">
      {/* Grande photo + module de recherche */}
      <section className="relative pt-4">
        <div className="relative h-[340px] overflow-hidden rounded-3xl md:h-[440px]">
          <picture>
            <source media="(min-width: 768px)" srcSet="/accueil-1600.jpg" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/accueil-900.jpg" alt="Salon lumineux avec canapé en cuir et fauteuils blancs" className="h-full w-full object-cover" fetchPriority="high" />
          </picture>
          <div className="absolute inset-0 bg-gradient-to-t from-encre/70 via-encre/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6 md:p-10 md:pb-24">
            <h1 className="max-w-2xl text-3xl font-extrabold leading-tight text-white md:text-5xl">
              Le mobilier qui transforme votre intérieur à Abidjan
            </h1>
            <p className="mt-2 max-w-xl text-white/90">Livré et monté chez vous. Payez en mobile money ou à la livraison.</p>
          </div>
        </div>
        <div className="relative z-10 mx-auto -mt-6 max-w-6xl rounded-3xl bg-white p-3 shadow-xl shadow-orange-900/10 md:-mt-16 md:p-4">
          <SearchPanel categories={categories} communes={communes} />
        </div>
      </section>

      {/* Bandeau compte, façon avantage membre */}
      {!session && (
        <section className="flex flex-col items-start justify-between gap-4 rounded-3xl bg-orange-100 p-6 md:flex-row md:items-center">
          <div>
            <h2 className="text-xl font-bold">Créez votre compte en 1 minute</h2>
            <p className="text-sm text-sable">Suivez vos livraisons sur WhatsApp, retrouvez vos adresses et vos factures. Sans mot de passe.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/inscription" className="btn-primary">Créer un compte</Link>
            <Link href="/connexion" className="btn-ghost">Se connecter</Link>
          </div>
        </section>
      )}

      {/* Pièces */}
      <section aria-labelledby="pieces">
        <h2 id="pieces" className="text-2xl font-bold">Explorer par pièce</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {categories.map((c) => (
            <Link key={c.id} href={`/catalogue?categorie=${c.slug}`} className="group">
              <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-orange-100">
                {CATEGORY_PHOTO[c.slug] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={CATEGORY_PHOTO[c.slug]} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105 motion-reduce:transition-none" />
                )}
              </div>
              <p className="mt-2 font-display font-bold">{c.name}</p>
              <p className="text-sm text-sable">{counts[c.id] ?? 0} meuble{(counts[c.id] ?? 0) > 1 ? 's' : ''}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Promotions */}
      {deals.length > 0 && (
        <section aria-labelledby="offres">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 id="offres" className="text-2xl font-bold">Offres du moment</h2>
              <p className="text-sm text-sable">Prix réduits sur une sélection de meubles, dans la limite des stocks.</p>
            </div>
            <Link href="/catalogue?promo=1" className="shrink-0 font-semibold text-orange-700 hover:underline">Voir tout</Link>
          </div>
          <div className="-mx-4 mt-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2">
            {deals.map((p) => (
              <div key={p.id} className="w-64 shrink-0 snap-start"><ProductCard p={p} /></div>
            ))}
          </div>
        </section>
      )}

      {/* Engagements */}
      <section className="grid gap-4 md:grid-cols-3">
        {PROMISES.map((x) => (
          <div key={x.title} className="card p-5">
            <h3 className="font-bold">{x.title}</h3>
            <p className="mt-1 text-sm text-sable">{x.text}</p>
          </div>
        ))}
      </section>

      {/* Nouveautés */}
      <section aria-labelledby="nouveautes">
        <div className="flex items-end justify-between gap-4">
          <h2 id="nouveautes" className="text-2xl font-bold">Nouveautés</h2>
          <Link href="/catalogue?tri=nouveautes" className="shrink-0 font-semibold text-orange-700 hover:underline">Voir tout</Link>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-4">
          {best.items.slice(0, 8).map((p) => <ProductCard key={p.id} p={p} />)}
        </div>
      </section>

      {/* Livraison */}
      <section className="card grid gap-6 p-6 md:grid-cols-[1fr_2fr] md:p-8">
        <div>
          <h2 className="text-2xl font-bold">On livre partout à Abidjan</h2>
          <p className="mt-2 text-sm text-sable">Frais fixes par commune, montage compris. Choisissez votre commune dans la recherche pour voir le prix livré.</p>
        </div>
        <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          {communes.map((c) => (
            <li key={c.commune} className="flex justify-between rounded-xl bg-orange-50 px-3 py-2">
              <Link href={`/catalogue?commune=${encodeURIComponent(c.commune)}`} className="font-semibold hover:underline">{c.commune}</Link>
              <span className="tabular-nums text-sable">{new Intl.NumberFormat('fr-FR').format(c.feeXof).replace(/ /g, ' ')} F</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
