import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="card mx-auto my-10 max-w-md p-8 text-center">
      <h1 className="text-2xl font-bold">Page introuvable</h1>
      <p className="mt-2 text-sable">Ce meuble ou cette page n&apos;existe pas, ou n&apos;est plus en ligne.</p>
      <Link href="/catalogue" className="btn-primary mt-6">Voir le catalogue</Link>
    </div>
  );
}
