import 'server-only';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { prisma } from './db';
import { env } from './env';
import { sendWhatsAppTemplate } from './notify';

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_REQUESTS_PER_10_MIN = 3;
const MAX_ATTEMPTS = 5;

export class OtpError extends Error {}

const hashCode = (phone: string, code: string) =>
  createHash('sha256').update(`${code}:${phone}:${env.sessionSecret()}`).digest('hex');

/** Génère un code à 6 chiffres, le stocke haché et l'envoie par WhatsApp. */
export async function requestOtp(phone: string, ip: string | null): Promise<void> {
  const recent = await prisma.otpChallenge.count({
    where: { phone, createdAt: { gt: new Date(Date.now() - 10 * 60 * 1000) } },
  });
  if (recent >= MAX_REQUESTS_PER_10_MIN) {
    throw new OtpError('Trop de demandes de code. Réessayez dans quelques minutes.');
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await prisma.otpChallenge.create({
    data: { phone, codeHash: hashCode(phone, code), expiresAt: new Date(Date.now() + OTP_TTL_MS), ip },
  });

  if (env.otpDevMode()) {
    console.info(`[OTP dev] ${phone} → ${code}`);
    return;
  }
  await sendWhatsAppTemplate(phone, env.whatsapp().otpTemplate, [code]);
}

/** Vérifie le dernier code envoyé à ce numéro. Usage unique, 5 essais maximum. */
export async function verifyOtp(phone: string, code: string): Promise<void> {
  const challenge = await prisma.otpChallenge.findFirst({
    where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!challenge) throw new OtpError('Code expiré. Demandez-en un nouveau.');
  if (challenge.attempts >= MAX_ATTEMPTS) throw new OtpError('Trop d\'essais. Demandez un nouveau code.');

  const expected = Buffer.from(challenge.codeHash, 'hex');
  const received = Buffer.from(hashCode(phone, code.trim()), 'hex');
  if (!/^\d{6}$/.test(code.trim()) || !timingSafeEqual(expected, received)) {
    await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    throw new OtpError('Code incorrect.');
  }
  await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
}
