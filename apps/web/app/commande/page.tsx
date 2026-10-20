import type { Metadata } from 'next';
import { withTenant } from '@/lib/db';
import { COD_DEPOSIT_THRESHOLD_XOF } from '@/lib/orders';
import { requireSession } from '@/lib/session';
import { getCurrentTenant } from '@/lib/tenant';
import { CheckoutForm } from './CheckoutForm';

export const metadata: Metadata = { title: 'Commande' };

export default async function CheckoutPage() {
  const session = await requireSession('/commande');
  const tenant = await getCurrentTenant();
  const zones = await withTenant(tenant.id, (tx) =>
    tx.deliveryZone.findMany({
      where: { tenantId: tenant.id, isActive: true, type: { in: ['abidjan', 'retrait_showroom'] } },
      orderBy: { baseFeeXof: 'asc' },
    }),
  );

  const communes = zones
    .filter((z) => z.type === 'abidjan')
    .flatMap((z) => z.communes.map((c) => ({ commune: c, feeXof: z.baseFeeXof, minDays: z.minDays, maxDays: z.maxDays, codAllowed: z.codAllowed, codMaxXof: z.codMaxXof })))
    .sort((a, b) => a.commune.localeCompare(b.commune, 'fr'));
  const showroom = zones.find((z) => z.type === 'retrait_showroom');

  return (
    <div className="py-5">
      <h1 className="mb-4 text-2xl font-bold">Finaliser ma commande</h1>
      <CheckoutForm
        communes={communes}
        showroom={showroom ? { name: showroom.name } : null}
        defaultPhone={session.phone}
        codThresholdXof={COD_DEPOSIT_THRESHOLD_XOF}
      />
    </div>
  );
}
