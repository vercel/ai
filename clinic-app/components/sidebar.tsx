'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/app/login/actions';
import type { Subscription, UserRole } from '@/lib/types';

function trialDaysLeft(trialEndsAt: string | null): number | null {
  if (!trialEndsAt) return null;
  const days = Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000);
  return days > 0 ? days : 0;
}

const LINKS: {
  href: string;
  label: string;
  roles: UserRole[];
  module?: string;
  children?: { href: string; label: string }[];
}[] = [
  { href: '/dashboard', label: 'Tela Inicial', roles: ['admin', 'medico', 'recepcao'] },
  {
    href: '/dashboard/panel',
    label: 'Painel',
    roles: ['admin', 'medico', 'recepcao'],
    module: 'dashboard',
  },
  {
    href: '/dashboard/patients',
    label: 'Pacientes',
    roles: ['admin', 'medico', 'recepcao'],
    module: 'patients',
  },
  {
    href: '/dashboard/appointments',
    label: 'Agendamentos',
    roles: ['admin', 'medico', 'recepcao'],
    module: 'appointments',
  },
  { href: '/dashboard/billing', label: 'Financeiro', roles: ['admin', 'recepcao'], module: 'billing' },
  {
    href: '/dashboard/campaigns',
    label: 'Campanhas',
    roles: ['admin', 'recepcao'],
    module: 'campaigns',
    children: [
      { href: '/dashboard/campaigns/panel', label: 'Painel' },
      { href: '/dashboard/campaigns', label: 'Campanhas' },
      { href: '/dashboard/campaigns/blocklist', label: 'Lista de bloqueio' },
    ],
  },
  {
    href: '/dashboard/fiscal-notes',
    label: 'Notas fiscais',
    roles: ['admin', 'recepcao'],
    module: 'fiscal_notes',
  },
  {
    href: '/dashboard/signatures',
    label: 'Assinatura eletrônica',
    roles: ['admin', 'recepcao'],
    module: 'signatures',
  },
  { href: '/dashboard/crm', label: 'CRM', roles: ['admin', 'recepcao'], module: 'crm' },
  {
    href: '/dashboard/conversations',
    label: 'Conversas',
    roles: ['admin', 'recepcao'],
    module: 'conversations',
  },
  {
    href: '/dashboard/lab-orders',
    label: 'Controle laboratório',
    roles: ['admin', 'medico', 'recepcao'],
    module: 'lab_orders',
  },
  {
    href: '/dashboard/cash-advances',
    label: 'Adiantamentos',
    roles: ['admin', 'medico', 'recepcao'],
    module: 'cash_advances',
  },
  {
    href: '/dashboard/charts',
    label: 'Gráficos',
    roles: ['admin', 'recepcao'],
    module: 'charts',
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
    module: 'reports',
    children: [
      { href: '/dashboard/reports/agenda', label: 'Agenda' },
      { href: '/dashboard/reports/clients', label: 'Clientes' },
      { href: '/dashboard/reports/financial', label: 'Financeiro' },
      { href: '/dashboard/reports/treatments', label: 'Tratamentos' },
    ],
  },
  { href: '/dashboard/store', label: 'Loja', roles: ['admin', 'recepcao'], module: 'store' },
  { href: '/dashboard/schedule', label: 'Minha agenda', roles: ['admin', 'medico'] },
  { href: '/dashboard/profile', label: 'Meu perfil', roles: ['admin', 'medico', 'recepcao'] },
  { href: '/dashboard/admin', label: 'Administração', roles: ['admin'] },
];

export function Sidebar({
  role,
  fullName,
  modules,
  planName,
  subscription,
  trialEndsAt,
}: {
  role: UserRole;
  fullName: string;
  modules: string[];
  planName: string | null;
  subscription: Subscription | null;
  trialEndsAt: string | null;
}) {
  const pathname = usePathname();
  const daysLeft = subscription?.status === 'trialing' ? trialDaysLeft(trialEndsAt) : null;

  return (
    <aside className="flex h-screen w-60 flex-col justify-between bg-navy-900">
      <div>
        <div className="border-b border-white/10 px-4 py-5">
          <p className="text-lg font-semibold text-white">Clinic Manager</p>
          <p className="text-xs text-blue-200/70">{fullName}</p>
          {planName && (
            <span className="mt-1 inline-block rounded-full bg-white/10 px-2 py-0.5 text-xs text-blue-200/80">
              {planName}
              {daysLeft !== null && ` · trial ${daysLeft}d`}
            </span>
          )}
        </div>
        <nav className="flex flex-col gap-1 px-2 py-3">
          {LINKS.filter(
            (link) => link.roles.includes(role) && (!link.module || modules.includes(link.module)),
          ).map((link) => {
            const active =
              pathname === link.href ||
              (link.href !== '/dashboard' && pathname.startsWith(link.href));
            return (
              <div key={link.href}>
                <Link
                  href={link.href}
                  className={`block rounded px-3 py-2 text-sm transition-colors ${
                    active
                      ? 'bg-brand-600 font-medium text-white'
                      : 'text-blue-100/80 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {link.label}
                </Link>
                {link.children && active && (
                  <div className="ml-3 mt-1 flex flex-col gap-1 border-l border-white/10 pl-3">
                    {link.children.map((child) => {
                      const childActive = pathname === child.href;
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={`rounded px-2 py-1 text-xs ${
                            childActive
                              ? 'bg-white/10 text-white'
                              : 'text-blue-200/60 hover:bg-white/5 hover:text-white'
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
      <div className="border-t border-white/10 px-2 py-4">
        {role === 'admin' && (
          <Link
            href="/dashboard/admin/subscription"
            className="mb-1 block rounded px-3 py-2 text-xs text-blue-200/60 hover:bg-white/5 hover:text-white"
          >
            Plano & Assinatura
          </Link>
        )}
        <form action={logout}>
          <button
            type="submit"
            className="w-full rounded px-3 py-2 text-left text-sm text-blue-200/70 hover:bg-white/5 hover:text-white"
          >
            Sair
          </button>
        </form>
      </div>
    </aside>
  );
}
