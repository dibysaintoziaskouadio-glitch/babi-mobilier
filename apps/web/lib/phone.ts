/** Normalise un numéro ivoirien saisi librement : « 07 00 00 00 01 », « 2250700000001 »… → « +2250700000001 ». */
export function normalizeIvorianPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  const national = digits.startsWith('225') && digits.length === 13 ? digits.slice(3) : digits;
  if (!/^(01|05|07|21|25|27)\d{8}$/.test(national)) return null;
  return `+225${national}`;
}

/** +2250700000001 → « 07 00 00 00 01 » */
export function formatIvorianPhone(e164: string): string {
  return e164.replace(/^\+225/, '').replace(/(\d{2})(?=\d)/g, '$1 ');
}
