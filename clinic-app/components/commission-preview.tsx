'use client';

import { useState } from 'react';

const BASE_CONSULTATION_CENTS = 30000; // R$ 300,00, valor de referência da simulação

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function CommissionPreview({ className }: { className?: string }) {
  const [rate, setRate] = useState(0);

  const clampedRate = Math.min(100, Math.max(0, rate));
  const professionalCents = Math.round((BASE_CONSULTATION_CENTS * clampedRate) / 100);
  const clinicCents = BASE_CONSULTATION_CENTS - professionalCents;

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        Percentual de repasse (comissão)
      </label>
      <div className="relative">
        <input
          name="commission_rate"
          type="number"
          min={0}
          max={100}
          step="0.01"
          required
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
          className={className}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
      </div>

      <div className="mt-3 rounded-lg border border-brand-100 bg-brand-50 p-4 text-sm">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-brand-600">
          Preview financeiro
        </p>
        <p className="text-gray-600">
          Para uma consulta base de <strong className="text-gray-800">{formatBRL(BASE_CONSULTATION_CENTS)}</strong>:
        </p>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-gray-600">O profissional receberá</span>
          <span className="font-semibold text-emerald-600">{formatBRL(professionalCents)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-600">A clínica reterá</span>
          <span className="font-semibold text-gray-800">{formatBRL(clinicCents)}</span>
        </div>
      </div>
    </div>
  );
}
