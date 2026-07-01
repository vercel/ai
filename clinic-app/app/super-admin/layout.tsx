import Link from 'next/link';
import { LayoutGrid, Building2, Users, LogOut, ArrowLeft, Radar } from 'lucide-react';
import { requireSuperAdmin } from '@/lib/super-admin';
import { logout } from '@/app/login/actions';

const NAV_ITEMS = [
  { href: '/super-admin', label: 'Visão geral', icon: LayoutGrid },
  { href: '/super-admin/clinics', label: 'Clínicas', icon: Building2 },
  { href: '/super-admin/team', label: 'Equipe', icon: Users },
];

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin();

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200">
      <aside className="flex w-60 flex-col justify-between border-r border-white/5 bg-slate-900/60">
        <div>
          <div className="flex items-center gap-2 border-b border-white/5 px-5 py-5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <Radar className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Centro de Comando</p>
              <p className="text-[11px] text-slate-500">Santé Clinic · Super Admin</p>
            </div>
          </div>
          <nav className="flex flex-col gap-1 px-3 py-4 text-sm">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="border-t border-white/5 px-3 py-4">
          <Link
            href="/dashboard"
            className="mb-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-slate-500 hover:bg-white/5 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar ao dashboard
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-500 hover:bg-white/5 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto bg-slate-950 p-8">{children}</main>
    </div>
  );
}
