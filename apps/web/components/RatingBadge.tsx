import { ratingLabel } from '@/lib/catalog';

/** Note sur 5 dans une pastille, suivie de l'appréciation et du nombre d'avis. Rien si aucun avis. */
export function RatingBadge({ avg, count, size = 'sm' }: { avg: number; count: number; size?: 'sm' | 'lg' }) {
  if (count === 0) return <span className="text-xs font-semibold text-sable">Nouveau</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`rounded-lg bg-encre font-display font-bold text-white ${size === 'lg' ? 'px-2.5 py-1 text-base' : 'px-1.5 py-0.5 text-sm'}`}>
        {avg.toFixed(1).replace('.', ',')}
      </span>
      <span className="text-sm"><b>{ratingLabel(avg)}</b> <span className="text-sable">({count} avis)</span></span>
    </span>
  );
}
