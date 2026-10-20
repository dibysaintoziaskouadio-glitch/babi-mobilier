'use client';
import { useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { createProductAction, type ProductFormState } from './actions';

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn-primary" disabled={pending}>{pending ? 'Enregistrement…' : 'Ajouter le produit'}</button>;
}

export function ProductForm({ categories }: { categories: { id: string; name: string }[] }) {
  const [state, action] = useFormState<ProductFormState, FormData>(createProductAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="card grid gap-3 p-5 sm:grid-cols-2">
      <h2 className="text-lg font-bold sm:col-span-2">Nouveau produit</h2>
      <div className="sm:col-span-2"><label htmlFor="name" className="label">Nom</label><input id="name" name="name" required className="field" placeholder="Canapé Cocody 3 places" /></div>
      <div><label htmlFor="categoryId" className="label">Catégorie</label>
        <select id="categoryId" name="categoryId" required className="field" defaultValue="">
          <option value="" disabled>Choisir</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div><label htmlFor="priceXof" className="label">Prix TTC (FCFA)</label><input id="priceXof" name="priceXof" type="number" inputMode="numeric" min={1000} step={5} required className="field" placeholder="385000" /></div>
      <div><label htmlFor="stock" className="label">Stock</label><input id="stock" name="stock" type="number" min={0} defaultValue={1} required className="field" /></div>
      <div><label htmlFor="materials" className="label">Matériaux <span className="font-normal text-sable">(séparés par des virgules)</span></label><input id="materials" name="materials" className="field" placeholder="iroko, velours" /></div>
      <div className="sm:col-span-2"><label htmlFor="description" className="label">Description</label><textarea id="description" name="description" rows={3} className="field" /></div>
      <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" name="publish" value="true" className="h-4 w-4 accent-orange-500" /> Publier tout de suite dans la boutique</label>
      {state.error && <p className="error sm:col-span-2" role="alert">{state.error}</p>}
      {state.ok && <p className="text-sm font-semibold text-green-700 sm:col-span-2" role="status">Produit ajouté.</p>}
      <div className="sm:col-span-2"><Submit /></div>
    </form>
  );
}
