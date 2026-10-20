import type { Metadata } from 'next';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Connexion' };

export default function LoginPage({ searchParams }: { searchParams: { retour?: string; erreur?: string } }) {
  return (
    <div className="card mx-auto my-8 max-w-md p-6">
      <h1 className="text-2xl font-bold">Connexion</h1>
      <p className="mb-5 mt-1 text-sable">Pas de mot de passe : on vous envoie un code sur WhatsApp.</p>
      {searchParams.erreur === 'acces' && (
        <p className="error mb-4" role="alert">Ce compte n&apos;a pas accès à l&apos;espace marchand.</p>
      )}
      <LoginForm retour={searchParams.retour ?? '/compte'} />
    </div>
  );
}
