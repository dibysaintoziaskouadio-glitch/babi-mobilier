'use client';
// Panier côté navigateur (localStorage, un panier par marchand). Il survit aux coupures réseau ;
// les prix affichés sont indicatifs, la commande relit tout en base.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export interface CartLine {
  variantId: string;
  productSlug: string;
  name: string;
  variantLabel: string;
  priceXof: number;
  color: string | null;
  imagePublicId: string | null;
  quantity: number;
}

interface CartContextValue {
  lines: CartLine[];
  ready: boolean;
  count: number;
  totalXof: number;
  add: (line: Omit<CartLine, 'quantity'>, quantity?: number) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);
const MAX_QTY = 20;

export function CartProvider({ tenantSlug, children }: { tenantSlug: string; children: React.ReactNode }) {
  const storageKey = `bm_panier_${tenantSlug}`;
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setLines(JSON.parse(saved));
    } catch {
      // stockage indisponible (navigation privée) : panier en mémoire seulement
    }
    setReady(true);
  }, [storageKey]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(lines));
    } catch {
      /* ignoré */
    }
  }, [lines, ready, storageKey]);

  const add = useCallback((line: Omit<CartLine, 'quantity'>, quantity = 1) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.variantId === line.variantId);
      if (existing) {
        return prev.map((l) => (l.variantId === line.variantId ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + quantity) } : l));
      }
      return [...prev, { ...line, quantity: Math.min(MAX_QTY, quantity) }];
    });
  }, []);

  const setQuantity = useCallback((variantId: string, quantity: number) => {
    setLines((prev) =>
      quantity <= 0 ? prev.filter((l) => l.variantId !== variantId) : prev.map((l) => (l.variantId === variantId ? { ...l, quantity: Math.min(MAX_QTY, quantity) } : l)),
    );
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      ready,
      count: lines.reduce((s, l) => s + l.quantity, 0),
      totalXof: lines.reduce((s, l) => s + l.quantity * l.priceXof, 0),
      add,
      setQuantity,
      remove: (id) => setQuantity(id, 0),
      clear: () => setLines([]),
    }),
    [lines, ready, add, setQuantity],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart doit être utilisé dans <CartProvider>');
  return ctx;
}
