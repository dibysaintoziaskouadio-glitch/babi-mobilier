import 'server-only';
import { env } from './env';

/**
 * Envoi d'un modèle WhatsApp (API Cloud de Meta). Les modèles doivent être validés
 * dans le Business Manager. En mode dev sans jeton, le message s'affiche dans la console.
 */
export async function sendWhatsAppTemplate(phoneE164: string, template: string, params: string[]): Promise<void> {
  const { token, phoneNumberId } = env.whatsapp();
  if (!token || !phoneNumberId) {
    console.info(`[WhatsApp simulé] ${phoneE164} · ${template} · ${params.join(' | ')}`);
    return;
  }
  const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phoneE164.replace('+', ''),
      type: 'template',
      template: {
        name: template,
        language: { code: 'fr' },
        components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }],
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`WhatsApp a refusé l'envoi (HTTP ${res.status}) : ${await res.text()}`);
}
