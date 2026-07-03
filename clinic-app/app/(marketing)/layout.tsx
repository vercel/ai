import Link from 'next/link';
import { Activity } from 'lucide-react';
import { MobileNav } from '@/components/marketing/mobile-nav';

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
        <Activity className="h-4.5 w-4.5 text-white" strokeWidth={2.5} />
      </div>
      <span className="text-lg font-semibold tracking-tight text-gray-900">
        clinic<span className="text-brand-600">-app</span>
      </span>
    </Link>
  );
}

function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/80 backdrop-blur-md">
      <div className="relative mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
        <Logo />

        <nav className="hidden items-center gap-8 text-sm font-medium text-gray-600 md:flex">
          <a href="#funcionalidades" className="transition-colors hover:text-gray-900">
            Funcionalidades
          </a>
          <a href="#precos" className="transition-colors hover:text-gray-900">
            Preços
          </a>
          <a href="#faq" className="transition-colors hover:text-gray-900">
            FAQ
          </a>
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/login"
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Entrar
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
          >
            Teste Grátis
          </Link>
        </div>

        <MobileNav />
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-gray-100 bg-white px-6 py-10 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
        <Logo />
        <div className="flex items-center gap-6 text-xs text-gray-500">
          <a href="#funcionalidades" className="hover:text-gray-900">Funcionalidades</a>
          <a href="#precos" className="hover:text-gray-900">Preços</a>
          <a href="#faq" className="hover:text-gray-900">FAQ</a>
          <Link href="/login" className="hover:text-gray-900">Entrar</Link>
        </div>
        <p className="text-xs text-gray-400">
          © {new Date().getFullYear()} clinic-app. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-gray-900 antialiased">
      <Navbar />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
