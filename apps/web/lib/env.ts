// Variables d'environnement lues côté serveur, avec des erreurs explicites.
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}

export const env = {
  appUrl: () => required('APP_URL').replace(/\/$/, ''),
  defaultTenantSlug: () => process.env.DEFAULT_TENANT_SLUG ?? 'babi-mobilier',
  sessionSecret: () => {
    const s = required('SESSION_SECRET');
    if (s.length < 32) throw new Error('SESSION_SECRET doit faire au moins 32 caractères');
    return s;
  },
  otpDevMode: () => process.env.OTP_DEV_MODE === 'true' && process.env.NODE_ENV !== 'production',
  cronSecret: () => required('CRON_SECRET'),
  cinetpay: () => ({
    apiKey: required('CINETPAY_API_KEY'),
    siteId: required('CINETPAY_SITE_ID'),
    secretKey: required('CINETPAY_SECRET_KEY'),
    transferPassword: process.env.CINETPAY_TRANSFER_PASSWORD ?? '',
  }),
  whatsapp: () => ({
    token: process.env.WHATSAPP_TOKEN ?? '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
    otpTemplate: process.env.WHATSAPP_OTP_TEMPLATE ?? 'code_connexion',
  }),
};
