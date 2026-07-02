'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/dashboard/reports', label: 'Visão Geral' },
  { href: '/dashboard/reports/agenda', label: 'Agenda' },
  { href: '/dashboard/reports/clients', label: 'Clientes' },
  { href: '/dashboard/reports/financial', label: 'Financeiro' },
  { href: '/dashboard/reports/treatments', label: 'Tratamentos' },
];

export function ReportsTabs() {
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
