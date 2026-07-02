'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
        aria-label={open ? 'Fechar menu' : 'Abrir menu'}
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full border-b border-gray-100 bg-white px-6 py-4 shadow-lg">
          <nav className="flex flex-col gap-1 text-sm font-medium text-gray-600">
            <a
              href="#funcionalidades"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 hover:bg-gray-50 hover:text-gray-900"
            >
              Funcionalidades
            </a>
            <a
              href="#precos"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 hover:bg-gray-50 hover:text-gray-900"
            >
              Preços
            </a>
            <a
              href="#faq"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 hover:bg-gray-50 hover:text-gray-900"
            >
              FAQ
            </a>
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 hover:bg-gray-50 hover:text-gray-900"
            >
              Entrar
            </Link>
            <Link
              href="/signup"
              onClick={() => setOpen(false)}
              className="mt-2 rounded-lg bg-brand-600 px-3 py-2.5 text-center font-semibold text-white hover:bg-brand-700"
            >
              Teste Grátis
            </Link>
          </nav>
        </div>
      )}
    </div>
  );
}
