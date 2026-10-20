'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const SORTS = [
  { value: 'populaires', label: 'Les plus populaires' },
  { value: 'prix_croissant', label: 'Prix : du moins cher au plus cher' },
  { value: 'prix_decroissant', label: 'Prix : du plus cher au moins cher' },
  { value: 'nouveautes', label: 'Nouveautés' },
];

export function SortSelect({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="hidden font-semibold sm:inline">Trier par</span>
      <select
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          if (e.target.value === 'populaires') next.delete('tri');
          else next.set('tri', e.target.value);
          next.delete('page');
          router.push(`${pathname}?${next.toString()}`);
        }}
        className="rounded-full border border-orange-200 bg-white px-4 py-2 font-semibold"
        aria-label="Trier les résultats"
      >
        {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
    </label>
  );
}
