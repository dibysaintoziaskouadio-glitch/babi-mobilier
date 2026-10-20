import type { DeliveryInfo } from '@/lib/catalog';
import { formatFcfa } from '@/lib/money';
import { IconSearch } from './icons';

const BUDGETS = [50_000, 100_000, 200_000, 400_000, 800_000];

/**
 * Module de recherche en 4 champs, comme une recherche d'hébergement :
 * quoi, quelle pièce, où livrer, quel budget. Envoie un GET vers /catalogue.
 */
export function SearchPanel({
  categories,
  communes,
  defaults = {},
  compact = false,
}: {
  categories: { slug: string; name: string }[];
  communes: DeliveryInfo[];
  defaults?: { q?: string; categorie?: string; commune?: string; prixMax?: string };
  compact?: boolean;
}) {
  const box = 'flex flex-col rounded-2xl border border-orange-200 bg-white px-4 py-2 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-200';
  const lbl = 'text-xs font-semibold text-sable';
  const input = 'w-full bg-transparent text-[15px] font-semibold text-encre outline-none placeholder:font-normal placeholder:text-sable/70';
  return (
    <form action="/catalogue" role="search" className={`grid gap-2 ${compact ? 'lg:grid-cols-[1.6fr_1fr_1fr_1fr_auto]' : 'md:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr_auto]'}`}>
      <label className={box}>
        <span className={lbl}>Que cherchez-vous ?</span>
        <span className="flex items-center gap-2">
          <IconSearch className="h-4 w-4 shrink-0 text-orange-600" />
          <input name="q" defaultValue={defaults.q} placeholder="Canapé, lit, chaise…" className={input} />
        </span>
      </label>
      <label className={box}>
        <span className={lbl}>Pièce</span>
        <select name="categorie" defaultValue={defaults.categorie ?? ''} className={input}>
          <option value="">Toutes les pièces</option>
          {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
      </label>
      <label className={box}>
        <span className={lbl}>Livrer à</span>
        <select name="commune" defaultValue={defaults.commune ?? ''} className={input}>
          <option value="">Ma commune</option>
          {communes.map((c) => <option key={c.commune} value={c.commune}>{c.commune}</option>)}
        </select>
      </label>
      <label className={box}>
        <span className={lbl}>Budget</span>
        <select name="prix_max" defaultValue={defaults.prixMax ?? ''} className={input}>
          <option value="">Tous les prix</option>
          {BUDGETS.map((b) => <option key={b} value={b}>Jusqu&apos;à {formatFcfa(b)}</option>)}
        </select>
      </label>
      <button className="btn-primary h-full min-h-14 px-8 text-base md:col-span-2 lg:col-span-1">Rechercher</button>
    </form>
  );
}
