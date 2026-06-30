'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/app/login/actions';
import type { UserRole } from '@/lib/types';

const LINKS: {
  href: string;
  label: string;
  roles: UserRole[];
  children?: { href: string; label: string }[];
}[] = [
  { href: '/dashboard', label: 'Tela Inicial', roles: ['admin', 'medico', 'recepcao'] },
  { href: '/dashboard/panel', label: 'Painel', roles: ['admin', 'medico', 'recepcao'] },
  { href: '/dashboard/patients', label: 'Pacientes', roles: ['admin', 'medico', 'recepcao'] },
  { href: '/dashboard/appointments', label: 'Agendamentos', roles: ['admin', 'medico', 'recepcao'] },
  { href: '/dashboard/billing', label: 'Financeiro', roles: ['admin', 'recepcao'] },
  {
    href: '/dashboard/campaigns',
    label: 'Campanhas',
    roles: ['admin', 'recepcao'],
    children: [
      { href: '/dashboard/campaigns/panel', label: 'Painel' },
      { href: '/dashboard/campaigns', label: 'Campanhas' },
      { href: '/dashboard/campaigns/blocklist', label: 'Lista de bloqueio' },
    ],
  },
  { href: '/dashboard/fiscal-notes', label: 'Notas fiscais', roles: ['admin', 'recepcao'] },
  { href: '/dashboard/signatures', label: 'Assinatura eletrônica', roles: ['admin', 'recepcao'] },
  { href: '/dashboard/crm', label: 'CRM', roles: ['admin', 'recepcao'] },
  { href: '/dashboard/conversations', label: 'Conversas', roles: ['admin', 'recepcao'] },
  { href: '/dashboard/lab-orders', label: 'Controle laboratório', roles: ['admin', 'medico', 'recepcao'] },
  { href: '/dashboard/cash-advances', label: 'Adiantamentos', roles: ['admin', 'medico', 'recepcao'] },
  {
    href: '/dashboard/charts',
    label: 'Gráficos',
    roles: ['admin', 'recepcao'],
    children: [
      { href: '/dashboard/charts/registrations', label: 'Novos cadastros' },
      { href: '/dashboard/charts/clients', label: 'Clientes' },
      { href: '/dashboard/charts/financial', label: 'Painel financeiro (beta)' },
      { href: '/dashboard/charts/cashflow', label: 'Entradas e saídas' },
      { href: '/dashboard/charts/sales', label: 'Vendas' },
      { href: '/dashboard/charts/appointments', label: 'Atendimentos' },
      { href: '/dashboard/charts/treatments', label: 'Tratamentos' },
      { href: '/dashboard/charts/budgets', label: 'Orçamentos' },
    ],
  },
  {
    href: '/dashboard/reports',
    label: 'Relatórios',
    roles: ['admin', 'recepcao'],
    children: [
      { href: '/dashboard/reports/agenda', label: 'Agenda' },
      { href: '/dashboard/reports/clients', label: 'Clientes' },
      { href: '/dashboard/reports/financial', label: 'Financeiro' },
      { href: '/dashboard/reports/treatments', label: 'Tratamentos' },
    ],
  },
  { href: '/dashboard/store', label: 'Loja', roles: ['admin', 'recepcao'] },
  { href: '/dashboard/schedule', label: 'Minha agenda', roles: ['admin', 'medico'] },
  { href: '/dashboard/profile', label: 'Meu perfil', roles: ['admin', 'medico', 'recepcao'] },
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
              <div key={link.href}>
                <Link
                  href={link.href}
                  className={`block rounded px-3 py-2 text-sm ${
                    active ? 'bg-brand-100 text-brand-700' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {link.label}
                </Link>
                {link.children && active && (
                  <div className="ml-3 mt-1 flex flex-col gap-1 border-l border-gray-200 pl-3">
                    {link.children.map((child) => {
                      const childActive = pathname === child.href;
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={`rounded px-2 py-1 text-xs ${
                            childActive
                              ? 'bg-brand-50 text-brand-700'
                              : 'text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
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
