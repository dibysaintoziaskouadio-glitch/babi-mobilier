import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { prisma } from './db';
import { env } from './env';

export interface CurrentTenant {
  id: string;
  slug: string;
  name: string;
  phone: string;
}

/**
 * Tenant de la requête, résolu par le middleware à partir du sous-domaine
 * (atelier-kone.babimobilier.ci) avec repli sur DEFAULT_TENANT_SLUG.
 * La table tenants n'est pas soumise à la RLS : lecture directe.
 */
export const getCurrentTenant = cache(async (): Promise<CurrentTenant> => {
  const slug = headers().get('x-tenant-slug') ?? env.defaultTenantSlug();
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, phone: true, status: true },
  });
  if (!tenant || tenant.status === 'suspended' || tenant.status === 'closed') notFound();
  return { id: tenant.id, slug: tenant.slug, name: tenant.name, phone: tenant.phone };
});
