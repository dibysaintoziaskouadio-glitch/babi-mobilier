import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Babi Mobilier',
    short_name: 'Babi Mobilier',
    description: 'Meubles livrés et montés à Abidjan',
    start_url: '/',
    display: 'standalone',
    background_color: '#FFF7F0',
    theme_color: '#F2700D',
    lang: 'fr',
    icons: [{ src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
