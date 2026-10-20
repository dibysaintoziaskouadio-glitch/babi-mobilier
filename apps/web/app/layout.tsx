import type { Metadata, Viewport } from 'next';
import { Figtree, Urbanist } from 'next/font/google';
import { CartProvider } from '@/components/cart';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { getSession } from '@/lib/session';
import { TabBar } from '@/components/TabBar';
import { getCurrentTenant } from '@/lib/tenant';
import './globals.css';

const display = Urbanist({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-display', display: 'swap' });
const body = Figtree({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Babi Mobilier | Meubles livrés à Abidjan', template: '%s | Babi Mobilier' },
  description:
    'Canapés, lits, bureaux et mobilier d\'extérieur livrés et montés à Abidjan. Paiement Orange Money, MTN, Moov, Wave ou à la livraison.',
};

export const viewport: Viewport = { themeColor: '#F2700D', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [tenant, session] = await Promise.all([getCurrentTenant(), getSession()]);
  return (
    <html lang="fr" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-screen bg-[#FFFBF7] pb-24 md:pb-0">
        <CartProvider tenantSlug={tenant.slug}>
          <Header tenantName={tenant.name} signedIn={Boolean(session)} firstName={session?.name.split(' ')[0]} />
          <main className="mx-auto max-w-7xl px-4">{children}</main>
          <Footer tenantName={tenant.name} />
          <TabBar />
        </CartProvider>
      </body>
    </html>
  );
}
