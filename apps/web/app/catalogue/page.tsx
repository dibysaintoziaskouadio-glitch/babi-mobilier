import type { Metadata } from 'next';
import Link from 'next/link';
import { ResultCard } from '@/components/ResultCard';
import { SearchPanel } from '@/components/SearchPanel';
import { categoryCounts, listCategories, listCommunes, listMaterials, listProducts, type CatalogSort } from '@/lib/catalog';
import { formatFcfa } from '@/lib/money';
import { getCurrentTenant } from '@/lib/tenant';
import { SortSelect } from './SortSelect';

export const metadata: Metadata = { title: 'Catalogue' };

const SORTS: CatalogSort[] = ['populaires', 'prix_croissant', 'prix_decroissant', 'nouveautes'];
const PRICE_STEPS = [50_000, 100_000, 200_000, 400_000];

type Search = {
  categorie?: string; q?: string; tri?: string; page?: string; commune?: string;
  prix_min?: string | string[]; prix_max?: string | string[]; materiau?: string | string[]; promo?: string; en_stock?: string;
};

const toInt = (raw?: string | string[]) => {
  const v = Array.isArray(raw) ? raw[raw.length - 1] : raw;
  return v && /^\d{1,9}$/.test(v) ? Number(v) : undefined;
};
const asArray = (v?: string | string[]) => (Array.isArray(v) ? v : v ? [v] : []);

export default async function CataloguePage({ searchParams: sp }: { searchParams: Search }) {
  const tenant = await getCurrentTenant();
  const tri = (SORTS.find((s) => s === sp.tri) ?? 'populaires') as CatalogSort;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.trim().slice(0, 60) || undefined;
  const materiaux = asArray(sp.materiau).slice(0, 10);
  const filters = {
    categorie: sp.categorie || undefined, q, tri, page,
    prixMin: toInt(sp.prix_min), prixMax: toInt(sp.prix_max),
    materiaux, promo: sp.promo === '1', enStock: sp.en_stock === '1',
  };

  const [categories, counts, communes, materials, result] = await Promise.all([
    listCategories(tenant.id),
    categoryCounts(tenant.id),
    listCommunes(tenant.id),
    listMaterials(tenant.id),
    listProducts(tenant.id, filters),
  ]);
  const delivery = communes.find((c) => c.commune === sp.commune) ?? null;
  const current = categories.find((c) => c.slug === sp.categorie);

  /** URL du catalogue avec les paramètres actuels, modifiés par patch (undefined = retiré). */
  const withParams = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (!(k in patch)) for (const x of asArray(v as string | string[])) p.append(k, x);
    for (const [k, v] of Object.entries(patch)) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/catalogue?${qs}` : '/catalogue';
  };
  const pageHref = (n: number) => withParams({ page: n > 1 ? String(n) : undefined });
  const activeCount = [filters.categorie, filters.prixMin, filters.prixMax, filters.promo || undefined, filters.enStock || undefined].filter(Boolean).length + materiaux.length;

  const Filters = (
    <form action="/catalogue" className="space-y-6">
      {q && <input type="hidden" name="q" value={q} />}
      {sp.commune && <input type="hidden" name="commune" value={sp.commune} />}
      {tri !== 'populaires' && <input type="hidden" name="tri" value={tri} />}

      <fieldset>
        <legend className="mb-2 font-display font-bold">Pièce</legend>
        <div className="space-y-1.5 text-sm">
          <label className="flex items-center gap-2"><input type="radio" name="categorie" value="" defaultChecked={!current} className="accent-orange-500" /> Toutes</label>
          {categories.map((c) => (
            <label key={c.id} className="flex items-center gap-2">
              <input type="radio" name="categorie" value={c.slug} defaultChecked={current?.id === c.id} className="accent-orange-500" />
              <span className="flex-1">{c.name}</span><span className="text-sable">{counts[c.id] ?? 0}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 font-display font-bold">Prix (FCFA)</legend>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-sable">Min<input name="prix_min" type="number" inputMode="numeric" min={0} step={5000} defaultValue={filters.prixMin} placeholder="0" className="field mt-1 py-2 text-sm" /></label>
          <label className="text-xs text-sable">Max<input name="prix_max" type="number" inputMode="numeric" min={0} step={5000} defaultValue={filters.prixMax} placeholder="Max" className="field mt-1 py-2 text-sm" /></label>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PRICE_STEPS.map((v) => (
            <Link key={v} href={withParams({ prix_max: String(v), prix_min: undefined, page: undefined })} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${filters.prixMax === v ? 'border-orange-500 bg-orange-500 text-white' : 'border-orange-200 bg-white'}`}>
              &lt; {formatFcfa(v).replace(' FCFA', ' F')}
            </Link>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 font-display font-bold">Offres et disponibilité</legend>
        <div className="space-y-1.5 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="promo" value="1" defaultChecked={filters.promo} className="accent-orange-500" /> En promotion</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="en_stock" value="1" defaultChecked={filters.enStock} className="accent-orange-500" /> En stock, livrable vite</label>
        </div>
      </fieldset>

      {materials.length > 0 && (
        <fieldset>
          <legend className="mb-2 font-display font-bold">Matériau</legend>
          <div className="space-y-1.5 text-sm">
            {materials.map((m) => (
              <label key={m.name} className="flex items-center gap-2">
                <input type="checkbox" name="materiau" value={m.name} defaultChecked={materiaux.includes(m.name)} className="accent-orange-500" />
                <span className="flex-1">{m.name[0].toUpperCase() + m.name.slice(1)}</span><span className="text-sable">{m.count}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex gap-2">
        <button className="btn-primary flex-1 py-2.5 text-sm">Appliquer</button>
        {activeCount > 0 && <Link href={`/catalogue${q ? `?q=${encodeURIComponent(q)}` : ''}`} className="btn-ghost py-2.5 text-sm">Effacer</Link>}
      </div>
    </form>
  );

  return (
    <div className="space-y-5 py-5">
      <div className="rounded-3xl bg-white p-3 shadow-sm ring-1 ring-orange-100">
        <SearchPanel compact categories={categories} communes={communes} defaults={{ q, categorie: sp.categorie, commune: sp.commune, prixMax: Array.isArray(sp.prix_max) ? sp.prix_max.at(-1) : sp.prix_max }} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[270px_1fr]">
        {/* Filtres : colonne sur ordinateur, panneau repliable sur mobile */}
        <aside className="hidden lg:block">
          <div className="card sticky top-20 p-5">{Filters}</div>
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">{current?.name ?? (q ? `Résultats pour « ${q} »` : 'Tous nos meubles')}</h1>
              <p className="text-sm text-sable">
                {result.total} meuble{result.total > 1 ? 's' : ''}
                {delivery ? ` · prix de livraison pour ${delivery.commune}` : ' · choisissez une commune pour voir le prix livré'}
              </p>
            </div>
            <SortSelect value={tri} />
          </div>

          <details className="card lg:hidden">
            <summary className="flex cursor-pointer items-center justify-between p-4 font-display font-bold">
              Filtres {activeCount > 0 && <span className="rounded-full bg-orange-500 px-2 text-sm text-white">{activeCount}</span>}
            </summary>
            <div className="border-t border-orange-100 p-4">{Filters}</div>
          </details>

          {result.items.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="font-display text-lg font-bold">Aucun meuble ne correspond à ces critères</p>
              <p className="mt-1 text-sable">Élargissez le budget ou retirez un filtre. Vous pouvez aussi nous demander un meuble sur mesure.</p>
              <Link href="/catalogue" className="btn-ghost mt-4">Effacer les filtres</Link>
            </div>
          ) : (
            <div className="space-y-4">
              {result.items.map((p) => <ResultCard key={p.id} p={p} delivery={delivery} />)}
            </div>
          )}

          {result.pageCount > 1 && (
            <nav className="flex items-center justify-center gap-3 pt-2" aria-label="Pagination">
              {page > 1 && <Link href={pageHref(page - 1)} className="btn-ghost">Précédent</Link>}
              <span className="text-sm text-sable">Page {page} sur {result.pageCount}</span>
              {page < result.pageCount && <Link href={pageHref(page + 1)} className="btn-ghost">Suivant</Link>}
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}
