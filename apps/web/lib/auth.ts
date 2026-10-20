import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma, withSystem } from './db';
import { capitalizeName, type Identity } from './identity';
import type { SessionPayload } from './session-token';
import type { CurrentTenant } from './tenant';

/**
 * Compte à ouvrir après un OTP valide, dans le contexte du tenant courant :
 *  - membre d'équipe du marchand (users.tenant_id = tenant) → session avec tid + rôles ;
 *  - sinon client plateforme (users.tenant_id NULL), créé au premier achat.
 */
export async function resolveAccount(
  tenant: CurrentTenant,
  phone: string,
  identity: Identity | null,
): Promise<SessionPayload | { needsName: true }> {
  const staff = await prisma.user.findFirst({ where: { tenantId: tenant.id, phone, isActive: true } });
  if (staff) {
    const roles = await withSystem((tx) => tx.userRole_.findMany({ where: { userId: staff.id, tenantId: tenant.id } }));
    await prisma.user.update({ where: { id: staff.id }, data: { lastLoginAt: new Date(), phoneVerifiedAt: staff.phoneVerifiedAt ?? new Date() } });
    return { sub: staff.id, name: staff.fullName, phone, tid: tenant.id, roles: roles.map((r) => r.role) };
  }

  let customer = await prisma.user.findFirst({ where: { tenantId: null, phone } });
  if (customer && !customer.isActive) throw new Error('Ce compte est désactivé. Contactez le service client.');
  if (!customer) {
    if (!identity) return { needsName: true };
    customer = await createCustomer(phone, identity);
  }
  await prisma.user.update({ where: { id: customer.id }, data: { lastLoginAt: new Date() } });
  return { sub: customer.id, name: customer.fullName, phone, roles: ['client'] };
}

export class AccountError extends Error {}

/** Un numéro ou un e-mail déjà rattaché à un compte client empêche l'inscription. */
export async function assertCanRegister(phone: string, email: string): Promise<void> {
  const existing = await prisma.user.findFirst({
    where: { tenantId: null, OR: [{ phone }, { email }] },
    select: { phone: true },
  });
  if (existing?.phone === phone) throw new AccountError('Ce numéro a déjà un compte. Connectez-vous avec ce numéro.');
  if (existing) throw new AccountError('Cette adresse e-mail est déjà utilisée par un autre compte.');
}

/** Crée un compte client plateforme. Le numéro doit avoir été vérifié par OTP juste avant. */
export async function createCustomer(phone: string, identity: Identity) {
  const firstName = capitalizeName(identity.firstName);
  const lastName = capitalizeName(identity.lastName);
  try {
    return await prisma.user.create({
      data: {
        phone,
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`,
        email: identity.email,
        phoneVerifiedAt: new Date(),
        whatsappOptIn: true,
      },
    });
  } catch (err) {
    // Course entre deux inscriptions : les index uniques tranchent.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AccountError('Ce numéro ou cette adresse e-mail a déjà un compte. Connectez-vous.');
    }
    throw err;
  }
}
