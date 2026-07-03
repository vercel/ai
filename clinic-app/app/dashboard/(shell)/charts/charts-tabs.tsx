'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/dashboard/charts/registrations', label: 'Novos cadastros' },
  { href: '/dashboard/charts/clients', label: 'Clientes' },
  { href: '/dashboard/charts/financial', label: 'Painel financeiro (beta)' },
  { href: '/dashboard/charts/cashflow', label: 'Entradas e saídas' },
  { href: '/dashboard/charts/sales', label: 'Vendas' },
  { href: '/dashboard/charts/appointments', label: 'Atendimentos' },
  { href: '/dashboard/charts/treatments', label: 'Tratamentos' },
  { href: '/dashboard/charts/budgets', label: 'Orçamentos' },
];

export function ChartsTabs() {
  const pathname = usePathname();

  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b border-gray-200">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`-mb-px border-b-2 px-3 py-2 text-xs font-medium ${
            pathname === tab.href
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
