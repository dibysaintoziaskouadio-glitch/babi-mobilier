import 'server-only';
import { PrismaClient, type Prisma } from '@prisma/client';

// Un seul client Prisma par processus (évite d'ouvrir des connexions à chaque rechargement en dev).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export type Tx = Prisma.TransactionClient;

/**
 * Exécute fn dans une transaction limitée au tenant (Row Level Security).
 * Toute lecture ou écriture sur une table métier passe par ici.
 */
export function withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
}

/** Transaction plateforme (jobs, webhooks, connexion) : contourne la RLS. À réserver au code serveur de confiance. */
export function withSystem<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
    return fn(tx);
  });
}
