import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/super-admin';
import { logout } from '@/app/login/actions';

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin();

  return (
    <div className="flex h-screen">
      <aside className="flex w-56 flex-col justify-between bg-gray-900">
        <div>
          <div className="border-b border-white/10 px-4 py-5">
            <p className="text-sm font-bold text-white">Super Admin</p>
            <p className="text-xs text-gray-400">Painel do sistema</p>
          </div>
          <nav className="flex flex-col gap-1 px-2 py-3 text-sm">
            {[
              { href: '/super-admin', label: 'Visão geral' },
              { href: '/super-admin/clinics', label: 'Clínicas' },
              { href: '/super-admin/team', label: 'Equipe' },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="block rounded px-3 py-2 text-gray-300 hover:bg-white/5 hover:text-white"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="border-t border-white/10 px-2 py-4">
          <Link
            href="/dashboard"
            className="mb-1 block rounded px-3 py-2 text-xs text-gray-400 hover:bg-white/5 hover:text-white"
          >
            ← Voltar ao dashboard
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="w-full rounded px-3 py-2 text-left text-sm text-gray-400 hover:bg-white/5 hover:text-white"
            >
              Sair
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto bg-gray-50 p-8">{children}</main>
    </div>
  );
}
