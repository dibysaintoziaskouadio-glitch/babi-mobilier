// Champs prénom, nom et e-mail, partagés par l'inscription et la première connexion.
export function IdentityFields({ intro, defaults }: { intro?: string; defaults?: { firstName?: string; lastName?: string; email?: string } }) {
  return (
    <div className="space-y-4">
      {intro && <p className="text-sm">{intro}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="firstName" className="label">Prénom</label>
          <input id="firstName" name="firstName" autoComplete="given-name" required minLength={2} maxLength={50} defaultValue={defaults?.firstName} placeholder="Aya" className="field" />
        </div>
        <div>
          <label htmlFor="lastName" className="label">Nom</label>
          <input id="lastName" name="lastName" autoComplete="family-name" required minLength={2} maxLength={50} defaultValue={defaults?.lastName} placeholder="Koné" className="field" />
        </div>
      </div>
      <div>
        <label htmlFor="email" className="label">Adresse e-mail</label>
        <input id="email" name="email" type="email" inputMode="email" autoComplete="email" required maxLength={120} defaultValue={defaults?.email} placeholder="aya.kone@exemple.ci" className="field" />
        <p className="mt-1 text-xs text-sable">Pour recevoir vos factures et devis.</p>
      </div>
    </div>
  );
}
