'use client';

import { updateUserRole } from '@/app/dashboard/(shell)/admin/actions';
import type { UserRole } from '@/lib/types';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  medico: 'Médico',
  recepcao: 'Recepção',
};

export function RoleSelect({ userId, role }: { userId: string; role: UserRole }) {
  return (
    <select
      defaultValue={role}
      onChange={(event) => updateUserRole(userId, event.target.value as UserRole)}
      className="rounded border border-gray-300 px-2 py-1 text-xs"
    >
      {Object.entries(ROLE_LABELS).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}
