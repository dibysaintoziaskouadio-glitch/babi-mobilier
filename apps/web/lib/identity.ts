import { z } from 'zod';

// Lettres (accents compris), espaces, apostrophes et traits d'union : Kouassi, N'Guessan, Aya-Marie…
const NAME = /^[\p{L}][\p{L}' -]*[\p{L}]$/u;

export const identitySchema = z.object({
  firstName: z.string().trim().min(2, 'Prénom trop court').max(50, 'Prénom trop long').regex(NAME, 'Prénom invalide'),
  lastName: z.string().trim().min(2, 'Nom trop court').max(50, 'Nom trop long').regex(NAME, 'Nom invalide'),
  email: z.string().trim().toLowerCase().max(120).email('Adresse e-mail invalide'),
});

export type Identity = z.infer<typeof identitySchema>;

/** « aya-marie » → « Aya-Marie », « N'GUESSAN » → « N'Guessan » */
export function capitalizeName(value: string): string {
  return value
    .toLocaleLowerCase('fr')
    .replace(/(^|[\s'-])(\p{L})/gu, (_m, sep: string, letter: string) => sep + letter.toLocaleUpperCase('fr'));
}
