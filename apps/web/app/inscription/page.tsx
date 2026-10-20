import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { SignupForm } from './SignupForm';

export const metadata: Metadata = { title: 'Créer un compte' };

export default async function SignupPage({ searchParams }: { searchParams: { retour?: string } }) {
  if (await getSession()) redirect('/compte');
  return (
    <div className="card mx-auto my-8 max-w-lg p-6">
      <h1 className="text-2xl font-bold">Créer mon compte</h1>
      <p className="mb-5 mt-1 text-sable">Suivez vos commandes, enregistrez vos adresses et recevez vos factures. Pas de mot de passe à retenir.</p>
      <SignupForm retour={searchParams.retour ?? '/compte'} />
    </div>
  );
}
