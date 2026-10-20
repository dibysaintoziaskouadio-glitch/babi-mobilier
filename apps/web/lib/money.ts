export const VAT_RATE = 0.18;

/** 149000 → « 149 000 FCFA » */
export function formatFcfa(value: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(value).replace(/ | /g, ' ')} FCFA`;
}

/** Les prix catalogue sont TTC : on en déduit HT et TVA, en FCFA entiers. */
export function splitTtc(ttc: number): { ht: number; tva: number; ttc: number } {
  const ht = Math.round(ttc / (1 + VAT_RATE));
  return { ht, tva: ttc - ht, ttc };
}

/** Arrondi au multiple de 5 supérieur (exigence CinetPay). */
export function roundUpTo5(value: number): number {
  return Math.ceil(value / 5) * 5;
}
