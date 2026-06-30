'use client';

import { deleteAvailability } from '@/app/dashboard/schedule/actions';

export function DeleteAvailabilityButton({ id }: { id: string }) {
  return (
    <button
      type="button"
      onClick={() => deleteAvailability(id)}
      className="text-red-500 hover:underline"
    >
      Remover
    </button>
  );
}
