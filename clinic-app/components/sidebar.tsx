'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/app/login/actions';
import type { UserRole } from '@/lib/types';

const LINKS: { href: string; label: string; roles: UserRole[] }[] = [
  { href: '/dashboard', label: 'Início', roles: ['admin', 'medico', 'recepcao'] },
  { href: '/dashboard/patients', label: 'Pacientes', roles: ['admin', 'medico', 'recepcao'] },
  { href: '/dashboard/appointments', label: 'Agendamentos', roles: ['admin', 'medico', 'recepcao'] },
  { href: '/dashboard/billing', label: 'Financeiro', roles: ['admin', 'recepcao'] },
  { href: '/dashboard/admin', label: 'Administração', roles: ['admin'] },
];

export function Sidebar({ role, fullName }: { role: UserRole; fullName: string }) {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-60 flex-col justify-between border-r border-gray-200 bg-white">
      <div>
        <div className="px-4 py-5">
          <p className="text-lg font-semibold text-brand-700">Clinic Manager</p>
          <p className="text-xs text-gray-500">{fullName}</p>
        </div>
        <nav className="flex flex-col gap-1 px-2">
          {LINKS.filter((link) => link.roles.includes(role)).map((link) => {
            const active =
              pathname === link.href ||
              (link.href !== '/dashboard' && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded px-3 py-2 text-sm ${
                  active ? 'bg-brand-100 text-brand-700' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <form action={logout} className="px-2 pb-4">
        <button
          type="submit"
          className="w-full rounded px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-100"
        >
          Sair
        </button>
      </form>
    </aside>
  );
}
