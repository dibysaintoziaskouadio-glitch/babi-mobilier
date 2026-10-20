import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductCard } from '@/components/ProductCard';
import { ProductVisual } from '@/components/ProductVisual';
import { RatingBadge } from '@/components/RatingBadge';
import { colorOf, getProduct, listCommunes, listProducts, variantLabel } from '@/lib/catalog';
import { formatFcfa } from '@/lib/money';
import { getCurrentTenant } from '@/lib/tenant';
import { VariantPicker } from './VariantPicker';

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tenant = await getCurrentTenant();
  const p = await getProduct(tenant.id, params.slug);
  return p ? { title: p.name, description: p.description?.slice(0, 155) } : {};
}

export default async function ProductPage({ params }: Props) {
  const tenant = await getCurrentTenant();
  const product = await getProduct(tenant.id, params.slug);
  if (!product) notFound();
  const [communes, similar] = await Promise.all([
    listCommunes(tenant.id),
    listProducts(tenant.id, { categorie: product.category.slug }),
  ]);

  const variants = product.variants.map((v) => ({
    id: v.id,
    label: variantLabel(v.attributes),
    priceXof: v.priceXof,
    compareAtXof: v.compareAtXof,
    available: v.stock - v.stockReserved,
    color: colorOf(v.attributes),
    dimensions: v.widthCm && v.depthCm && v.heightCm ? `L ${v.widthCm} × P ${v.depthCm} × H ${v.heightCm} cm` : null,
  }));
  const first = product.variants[0];
  const image = product.images[0]?.publicId ?? null;
  const cheapest = communes.length ? Math.min(...communes.map((c) => c.feeXof)) : null;
  const others = similar.items.filter((p) => p.id !== product.id).slice(0, 4);

  return (
    <div className="space-y-10 py-5">
      <nav aria-label="Fil d'Ariane" className="text-sm text-sable">
        <Link href="/" className="hover:underline">Accueil</Link> ›{' '}
        <Link href={`/catalogue?categorie=${product.category.slug}`} className="hover:underline">{product.category.name}</Link> ›{' '}
        <span className="text-encre">{product.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          <header>
            <h1 className="text-3xl font-extrabold md:text-4xl">{product.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <RatingBadge avg={Number(product.ratingAvg)} count={product.ratingCount} size="lg" />
              <span className="text-sm text-sable">{product.category.name}</span>
            </div>
          </header>

          <div className="grid aspect-[4/3] place-items-center overflow-hidden rounded-3xl bg-orange-100">
            <ProductVisual publicId={image} color={variants[0]?.color ?? null} alt={product.name} size={900} />
          </div>

          <nav className="flex gap-1 overflow-x-auto border-b border-orange-100 text-sm font-semibold" aria-label="Sections">
            {[['apercu', 'Aperçu'], ['dimensions', 'Dimensions'], ['livraison', 'Livraison et paiement']].map(([id, label]) => (
              <a key={id} href={`#${id}`} className="whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 hover:border-orange-500">{label}</a>
            ))}
          </nav>

          <section id="apercu" className="scroll-mt-24 space-y-3">
            <h2 className="text-xl font-bold">Aperçu</h2>
            {product.description && <p className="max-w-prose leading-relaxed">{product.description}</p>}
            <ul className="grid gap-2 sm:grid-cols-2">
              {product.materials.length > 0 && <li className="card p-3 text-sm"><b>Matériaux</b><br />{product.materials.join(', ')}</li>}
              <li className="card p-3 text-sm"><b>Montage</b><br />Inclus à Abidjan</li>
              <li className="card p-3 text-sm"><b>Paiement</b><br />Mobile money ou espèces à la livraison</li>
              <li className="card p-3 text-sm"><b>Vérification</b><br />Contrôlez le meuble devant le livreur</li>
            </ul>
          </section>

          <section id="dimensions" className="scroll-mt-24 space-y-3">
            <h2 className="text-xl font-bold">Dimensions</h2>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="bg-orange-50 text-left font-display"><tr><th className="p-3">Modèle</th><th className="p-3">Largeur</th><th className="p-3">Profondeur</th><th className="p-3">Hauteur</th></tr></thead>
                <tbody className="divide-y divide-orange-100">
                  {product.variants.map((v) => (
                    <tr key={v.id}><td className="p-3">{variantLabel(v.attributes)}</td><td className="p-3 tabular-nums">{v.widthCm ?? '–'} cm</td><td className="p-3 tabular-nums">{v.depthCm ?? '–'} cm</td><td className="p-3 tabular-nums">{v.heightCm ?? '–'} cm</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            {first?.widthCm && <p className="text-sm text-sable">Pensez à mesurer vos portes et l&apos;escalier : le meuble fait {first.widthCm} cm de large.</p>}
          </section>

          <section id="livraison" className="scroll-mt-24 space-y-3">
            <h2 className="text-xl font-bold">Livraison et paiement</h2>
            <p className="text-sm">Livraison et montage à Abidjan{cheapest !== null ? ` à partir de ${formatFcfa(cheapest)}` : ''}. Le prix exact s&apos;affiche au moment de commander.</p>
            <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              {communes.map((c) => (
                <li key={c.commune} className="flex justify-between rounded-xl bg-orange-50 px-3 py-2"><span>{c.commune}</span><span className="tabular-nums text-sable">{formatFcfa(c.feeXof).replace(' FCFA', ' F')}</span></li>
              ))}
            </ul>
            <p className="text-sm">Paiement accepté : Orange Money, MTN MoMo, Moov Money, Wave, ou espèces au livreur.</p>
          </section>
        </div>

        {/* Encadré prix, toujours visible */}
        <aside>
          <div className="card sticky top-20 space-y-4 p-5 shadow-lg shadow-orange-900/5">
            {variants.length > 0 ? (
              <VariantPicker variants={variants} product={{ slug: product.slug, name: product.name, imagePublicId: image }} />
            ) : (
              <p className="text-sable">Ce meuble n&apos;est pas disponible pour le moment.</p>
            )}
            <ul className="space-y-1 border-t border-orange-100 pt-3 text-sm">
              <li className="text-green-700">✓ Paiement à la livraison possible</li>
              <li className="text-green-700">✓ Montage inclus à Abidjan</li>
              <li className="text-green-700">✓ Prix TVA 18 % incluse</li>
            </ul>
          </div>
        </aside>
      </div>

      {others.length > 0 && (
        <section aria-labelledby="similaires">
          <h2 id="similaires" className="text-2xl font-bold">Dans la même pièce</h2>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-4">
            {others.map((p) => <ProductCard key={p.id} p={p} />)}
          </div>
        </section>
      )}
    </div>
  );
}
