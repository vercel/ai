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
        className="rounded-lg p-2 text-gray-400 hover:bg-white/5 hover:text-white"
        aria-label={open ? 'Fechar menu' : 'Abrir menu'}
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full border-b border-white/5 bg-ink px-6 py-4 shadow-2xl">
          <nav className="flex flex-col gap-1 text-sm font-medium text-gray-300">
            <a
              href="#recursos"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 hover:bg-white/5 hover:text-white"
            >
              Recursos
            </a>
            <a
              href="#planos"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 hover:bg-white/5 hover:text-white"
            >
              Planos
            </a>
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 hover:bg-white/5 hover:text-white"
            >
              Entrar
            </Link>
            <Link
              href="/signup"
              onClick={() => setOpen(false)}
              className="mt-2 rounded-lg bg-electric-500 px-3 py-2.5 text-center font-semibold text-white shadow-glow hover:bg-electric-600"
            >
              Iniciar Teste Grátis
            </Link>
          </nav>
        </div>
      )}
    </div>
  );
}
