'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MessageCircle } from 'lucide-react';

export interface ProfessionalPerformance {
  professional_id: string;
  professional_name: string;
  revenue_cents: number;
  appointments_count: number;
}

export interface ChurnRiskPatient {
  patient_id: string;
  full_name: string;
  phone: string | null;
  last_appointment_at: string;
}

interface FinancialMetrics {
  total_revenue_cents: number;
  average_ticket_cents: number;
  default_rate: number;
}

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function whatsappLink(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return `https://wa.me/55${digits}`;
}

export function ReportsOverview({
  financial,
  appointmentsThisMonth,
  noShowRate,
  performance,
  churnRisk,
}: {
  financial: FinancialMetrics;
  appointmentsThisMonth: number;
  noShowRate: number;
  performance: ProfessionalPerformance[];
  churnRisk: ChurnRiskPatient[];
}) {
  const chartData = performance.map((p) => ({
    name: p.professional_name.split(' ')[0],
    fullName: p.professional_name,
    revenue: p.revenue_cents / 100,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Receita do mês" value={formatBRL(financial.total_revenue_cents)} />
        <KpiCard label="Ticket médio" value={formatBRL(financial.average_ticket_cents)} />
        <KpiCard label="Taxa de inadimplência" value={`${financial.default_rate}%`} tone="amber" />
        <KpiCard label="Consultas no mês" value={String(appointmentsThisMonth)} />
        <KpiCard label="Taxa de no-show" value={`${noShowRate}%`} tone="red" />
      </div>

      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">Profissional vs. Receita gerada</h2>
        {chartData.length === 0 ? (
          <p className="text-sm text-gray-400">Sem dados de profissionais ainda.</p>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `R$${v}`} />
                <Tooltip
                  formatter={(value) => formatBRL(Number(value) * 100)}
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName ?? label}
                />
                <Bar dataKey="revenue" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-gray-700">Pacientes em risco de evasão</h2>
        <p className="mb-4 text-xs text-gray-400">
          Última consulta concluída há mais de 6 meses, sem retorno agendado.
        </p>
        <div className="overflow-hidden rounded-lg border border-gray-100">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-3">Paciente</th>
                <th className="px-4 py-3">Última consulta</th>
                <th className="px-4 py-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {churnRisk.map((patient) => (
                <tr key={patient.patient_id} className="border-t border-gray-100">
                  <td className="px-4 py-3 text-gray-800">{patient.full_name}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(patient.last_appointment_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {patient.phone ? (
                      <a
                        href={whatsappLink(patient.phone)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                      >
                        <MessageCircle size={14} />
                        WhatsApp
                      </a>
                    ) : (
                      <span className="text-xs text-gray-400">Sem telefone</span>
                    )}
                  </td>
                </tr>
              ))}
              {churnRisk.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                    Nenhum paciente em risco de evasão no momento.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'amber' | 'red';
}) {
  const toneClass =
    tone === 'amber' ? 'text-amber-600' : tone === 'red' ? 'text-red-600' : 'text-gray-800';

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
