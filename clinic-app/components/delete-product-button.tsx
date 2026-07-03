'use client';

import { deleteProduct } from '@/app/dashboard/(shell)/store/products/actions';

export function DeleteProductButton({ id }: { id: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (confirm('Remover este produto?')) {
          deleteProduct(id);
        }
      }}
      className="text-xs text-red-500 hover:underline"
    >
      Excluir
    </button>
  );
}
