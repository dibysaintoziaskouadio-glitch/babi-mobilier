// Données de démonstration : un marchand, ses catégories, 8 meubles, les zones de livraison d'Abidjan
// et un compte administrateur. Les prix sont des exemples, à remplacer par le vrai catalogue.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const ADMIN_PHONE = process.env.SEED_ADMIN_PHONE ?? '+2250700000001';

const CATEGORIES = [
  { slug: 'salon', name: 'Salon' },
  { slug: 'chambre', name: 'Chambre' },
  { slug: 'bureau', name: 'Bureau' },
  { slug: 'salle-a-manger', name: 'Salle à manger' },
  { slug: 'exterieur', name: 'Extérieur' },
];

type Demo = {
  cat: string; slug: string; name: string; materials: string[]; desc: string;
  variants: { sku: string; price: number; compare: number | null; stock: number; attrs: Record<string, string>; dims: [number, number, number] }[];
};
// Photo : public/produits/<slug>.jpg (voir public/produits/CREDITS.md)
// Références des premiers produits de démonstration, conservées pour mettre à jour une base existante.
const LEGACY_SKU: Record<string, string> = {
  'canape-cocody-3-places': 'CC3-SAB', 'table-basse-bassam': 'TBB-100', 'lit-bingerville-160': 'LB-160',
  'armoire-yamoussoukro': 'AY-3P', 'bureau-plateau': 'BP-140', 'fauteuil-ergo-riviera': 'FER-NR',
};
const P = (cat: string, slug: string, name: string, price: number, compare: number | null, stock: number, materials: string[], desc: string, attrs: Record<string, string>, dims: [number, number, number]): Demo =>
  ({ cat, slug, name, materials, desc, variants: [{ sku: LEGACY_SKU[slug] ?? slug.toUpperCase().slice(0, 40), price, compare, stock, attrs, dims }] });

const PRODUCTS: Demo[] = [
  { cat: 'salon', slug: 'fauteuil-assinie', name: 'Fauteuil Assinie', materials: ['iroko', 'velours'], desc: 'Fauteuil enveloppant en velours sur pieds en iroko massif. Le coin lecture que tout le monde vous enviera.',
    variants: [
      { sku: 'FA-ORG', price: 149000, compare: 165000, stock: 6, attrs: { couleur: 'Orange brûlé', bois: 'Iroko', couleur_hex: '#E8650A' }, dims: [82, 78, 90] },
      { sku: 'FA-VRT', price: 149000, compare: 165000, stock: 3, attrs: { couleur: 'Vert forêt', bois: 'Iroko', couleur_hex: '#2F5D3A' }, dims: [82, 78, 90] },
    ] },
  P('salon', 'canape-cocody-3-places', 'Canapé Cocody 3 places', 385000, 420000, 4, ['iroko', 'cuir'], 'Grand canapé trois places en cuir caramel, assise profonde pour les dimanches en famille.', { couleur: 'Caramel', couleur_hex: '#B9773E' }, [220, 92, 85]),
  P('salon', 'canape-riviera-velours-vert', 'Canapé Riviera velours', 349000, 389000, 5, ['velours', 'hévéa'], 'Canapé trois places en velours vert émeraude, pieds en bois clair.', { couleur: 'Vert émeraude', couleur_hex: '#1F5E4B' }, [210, 88, 82]),
  P('salon', 'canape-angre-gris', 'Canapé Angré', 289000, null, 7, ['tissu', 'samba'], 'Canapé trois places en tissu gris clair, facile à vivre et à entretenir.', { couleur: 'Gris perle', couleur_hex: '#A8B1BA' }, [200, 90, 84]),
  P('salon', 'canape-capitonne-marcory', 'Canapé capitonné Marcory', 315000, 349000, 3, ['tissu', 'hêtre'], 'Canapé au dossier capitonné, coussins inclus.', { couleur: 'Gris anthracite', couleur_hex: '#6E6E73' }, [205, 90, 86]),
  P('salon', 'fauteuil-treichville-moutarde', 'Fauteuil Treichville et son pouf', 135000, null, 6, ['tissu', 'hévéa'], 'Fauteuil à oreilles jaune moutarde, livré avec son pouf assorti.', { couleur: 'Moutarde', couleur_hex: '#D9A030' }, [76, 80, 100]),
  P('salon', 'fauteuil-capitonne-grand-bassam', 'Fauteuil capitonné Grand-Bassam', 119000, null, 4, ['velours', 'hêtre laqué'], 'Petit fauteuil crapaud capitonné, idéal en chambre ou en entrée.', { couleur: 'Ivoire', couleur_hex: '#EDE6DA' }, [68, 66, 82]),
  P('salon', 'chauffeuse-pivotante-deux-plateaux', 'Chauffeuse pivotante Deux-Plateaux', 98000, 110000, 8, ['tissu', 'acier'], 'Chauffeuse pivotante en tissu chiné, piètement doré.', { couleur: 'Lin', couleur_hex: '#BDB3A4' }, [70, 72, 85]),
  P('salon', 'table-basse-bassam', 'Table basse Bassam', 79000, null, 10, ['teck'], 'Table basse ronde en teck massif, plateau huilé.', { bois: 'Teck', couleur_hex: '#7A4A2A' }, [90, 90, 40]),
  P('salon', 'console-port-bouet', 'Console Port-Bouët', 85000, null, 5, ['bois recyclé'], 'Console basse en bois brut avec niche de rangement.', { bois: 'Bois recyclé', couleur_hex: '#B89470' }, [100, 35, 70]),
  P('salon', 'meuble-tv-koumassi', 'Meuble TV Koumassi', 175000, 195000, 4, ['acacia', 'rotin'], 'Meuble TV en acacia, portes cannées, pour les soirs de match.', { bois: 'Acacia', couleur_hex: '#A9743F' }, [160, 40, 55]),
  P('chambre', 'lit-bingerville-160', 'Lit Bingerville 160 × 200', 289000, 320000, 5, ['samba', 'tissu'], 'Lit double avec tête de lit capitonnée.', { taille: '160 × 200', couleur: 'Beige', couleur_hex: '#C9B8A2' }, [170, 215, 120]),
  P('chambre', 'lit-riviera-golf-160', 'Lit Riviera Golf 160 × 200', 329000, null, 3, ['samba', 'tissu'], 'Lit double à grande tête de lit rembourrée, style hôtel.', { taille: '160 × 200', couleur: 'Gris', couleur_hex: '#77787C' }, [175, 215, 130]),
  P('chambre', 'lit-anoumabo-terracotta', 'Lit Anoumabo 160 × 200', 275000, 299000, 4, ['iroko'], 'Lit en iroko clair, simple et chaleureux.', { taille: '160 × 200', bois: 'Iroko', couleur_hex: '#C5925E' }, [168, 210, 95]),
  P('chambre', 'armoire-yamoussoukro', 'Armoire Yamoussoukro 2 portes', 345000, null, 2, ['samba'], 'Armoire deux portes avec penderie et étagères.', { couleur: 'Noyer', couleur_hex: '#8A5A33' }, [110, 60, 200]),
  P('chambre', 'table-de-chevet-songon', 'Table de chevet Songon', 45000, null, 12, ['MDF laqué', 'hêtre'], 'Chevet blanc avec tiroir et pieds en bois.', { couleur: 'Blanc', couleur_hex: '#F2F2F0' }, [45, 35, 55]),
  P('chambre', 'gueridon-attoban', 'Guéridon Attoban', 35000, null, 15, ['bois laqué'], 'Petit guéridon rond, parfait en bout de lit ou de canapé.', { couleur: 'Blanc', couleur_hex: '#FFFFFF' }, [40, 40, 55]),
  P('chambre', 'etagere-murale-koumassi', 'Colonne murale Koumassi', 69000, null, 6, ['chêne clair'], 'Colonne de rangement murale à niches ouvertes.', { bois: 'Chêne clair', couleur_hex: '#CDB794' }, [40, 30, 160]),
  P('bureau', 'bureau-plateau', 'Bureau Plateau', 165000, null, 8, ['chêne', 'acier'], 'Bureau en bois massif, pour la maison ou l\'open space.', { dimensions: '140 × 70', couleur_hex: '#9C6B3F' }, [140, 70, 75]),
  P('bureau', 'fauteuil-ergo-riviera', 'Fauteuil de bureau Riviera', 89000, 99000, 12, ['maille', 'aluminium'], 'Fauteuil de bureau à roulettes, hauteur réglable.', { couleur: 'Gris', couleur_hex: '#6B6F75' }, [65, 65, 110]),
  P('bureau', 'fauteuil-coque-cocody', 'Fauteuil coque Cocody', 95000, null, 5, ['contreplaqué', 'cuir'], 'Fauteuil coque en contreplaqué moulé et coussin blanc.', { couleur: 'Blanc', couleur_hex: '#F4F4F2' }, [80, 70, 72]),
  P('salle-a-manger', 'table-ronde-deux-plateaux', 'Table ronde Deux-Plateaux', 189000, null, 6, ['laqué', 'hêtre'], 'Table ronde blanche pour 4 personnes, pieds en hêtre.', { taille: 'Ø 110', couleur_hex: '#F7F7F5' }, [110, 110, 75]),
  P('salle-a-manger', 'ensemble-repas-emeraude', 'Ensemble repas Émeraude', 690000, 760000, 2, ['chêne', 'velours'], 'Grande table en chêne et 8 chaises en velours vert, pour recevoir comme il se doit.', { places: '8 personnes', couleur_hex: '#20594A' }, [220, 100, 76]),
  P('salle-a-manger', 'chaise-coque-abobo', 'Chaise coque Abobo', 39000, null, 30, ['polypropylène', 'hêtre'], 'Chaise coque noire, assise rembourrée, pieds en hêtre.', { couleur: 'Noir', couleur_hex: '#222222' }, [48, 54, 83]),
  P('salle-a-manger', 'chaise-tapissee-plateau', 'Chaise tapissée Plateau', 59000, null, 16, ['tissu', 'frêne'], 'Chaise de salle à manger tapissée, dossier enveloppant.', { couleur: 'Gris', couleur_hex: '#8C8C8C' }, [52, 58, 95]),
  P('salle-a-manger', 'tabouret-bar-adjame', 'Tabouret de bar Adjamé', 29000, null, 20, ['hévéa'], 'Tabouret haut en bois massif pour îlot ou comptoir.', { couleur: 'Bois blanchi', couleur_hex: '#D8D2C8' }, [38, 38, 75]),
  P('exterieur', 'chaise-jardin-grand-lahou', 'Chaise de jardin Grand-Lahou', 45000, null, 10, ['teck'], 'Chaise en teck tourné, à l\'aise sur la terrasse comme dans la cour.', { bois: 'Teck', couleur_hex: '#B9873A' }, [45, 48, 90]),
];

const ZONES = [
  { type: 'abidjan' as const, name: 'Abidjan A', communes: ['Plateau', 'Cocody', 'Marcory', 'Treichville', 'Adjamé'], fee: 5000, min: 1, max: 2 },
  { type: 'abidjan' as const, name: 'Abidjan B', communes: ['Yopougon', 'Abobo', 'Koumassi', 'Port-Bouët', 'Attécoubé', 'Bingerville'], fee: 8000, min: 1, max: 3 },
  { type: 'abidjan' as const, name: 'Grand Abidjan', communes: ['Anyama', 'Songon', 'Grand-Bassam'], fee: 15000, min: 2, max: 4, codMax: 150000 },
  { type: 'retrait_showroom' as const, name: 'Showroom Cocody', communes: [], fee: 0, min: 0, max: 1 },
];

async function main() {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;

    const tenant = await tx.tenant.upsert({
      where: { slug: 'babi-mobilier' },
      update: {},
      create: { slug: 'babi-mobilier', name: 'Babi Mobilier', phone: '+2252722000000', status: 'active' },
    });

    const cats: Record<string, string> = {};
    for (const [i, c] of CATEGORIES.entries()) {
      const row = await tx.category.upsert({
        where: { tenantId_slug: { tenantId: tenant.id, slug: c.slug } },
        update: { name: c.name, position: i },
        create: { tenantId: tenant.id, slug: c.slug, name: c.name, position: i },
      });
      cats[c.slug] = row.id;
    }

    for (const p of PRODUCTS) {
      const product = await tx.product.upsert({
        where: { tenantId_slug: { tenantId: tenant.id, slug: p.slug } },
        update: { categoryId: cats[p.cat], name: p.name, description: p.desc, materials: p.materials, basePriceXof: p.variants[0].price },
        create: {
          tenantId: tenant.id, categoryId: cats[p.cat], slug: p.slug, name: p.name, description: p.desc,
          materials: p.materials, basePriceXof: p.variants[0].price, isPublished: true,
        },
      });
      if (!(await tx.productImage.findFirst({ where: { productId: product.id } }))) {
        await tx.productImage.create({ data: { tenantId: tenant.id, productId: product.id, publicId: `/produits/${p.slug}.jpg`, alt: p.name, isInSitu: true } });
      }
      for (const v of p.variants) {
        await tx.productVariant.upsert({
          where: { tenantId_sku: { tenantId: tenant.id, sku: v.sku } },
          // Le stock n'est jamais écrasé par une nouvelle exécution du script.
          update: { attributes: v.attrs, priceXof: v.price, compareAtXof: v.compare, widthCm: v.dims[0], depthCm: v.dims[1], heightCm: v.dims[2] },
          create: {
            tenantId: tenant.id, productId: product.id, sku: v.sku, attributes: v.attrs, priceXof: v.price,
            compareAtXof: v.compare, stock: v.stock, widthCm: v.dims[0], depthCm: v.dims[1], heightCm: v.dims[2],
          },
        });
      }
    }

    for (const z of ZONES) {
      await tx.deliveryZone.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: z.name } },
        update: {},
        create: { tenantId: tenant.id, type: z.type, name: z.name, communes: z.communes, baseFeeXof: z.fee, minDays: z.min, maxDays: z.max, codMaxXof: z.codMax ?? null },
      });
    }

    const admin =
      (await tx.user.findFirst({ where: { tenantId: tenant.id, phone: ADMIN_PHONE } })) ??
      (await tx.user.create({ data: { tenantId: tenant.id, phone: ADMIN_PHONE, fullName: 'Administrateur Babi Mobilier' } }));
    await tx.userRole_.upsert({
      where: { userId_tenantId_role: { userId: admin.id, tenantId: tenant.id, role: 'admin' } },
      update: {},
      create: { userId: admin.id, tenantId: tenant.id, role: 'admin' },
    });
  });
  console.log(`Données de démonstration chargées. Admin : ${ADMIN_PHONE}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
