'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MessageCircle } from 'lucide-react';
import type {
  ChurnRiskPatient,
  FinancialMetrics,
  ProfessionalPerformance,
} from '@/app/dashboard/(shell)/reports/actions';

// A falta em mais de 1 a cada 10 consultas é o ponto em que o gestor
// precisa agir (confirmações, lembretes) — acima disso o card fica vermelho.
const HIGH_NO_SHOW_THRESHOLD = 10;

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function whatsappLink(patient: ChurnRiskPatient) {
  const digits = (patient.phone ?? '').replace(/\D/g, '');
  const firstName = patient.full_name.split(' ')[0];
  const message = `Olá ${firstName}, sentimos sua falta! Faz um tempo desde sua última consulta. Que tal agendar um retorno? Estamos à disposição.`;
  return `https://wa.me/55${digits}?text=${encodeURIComponent(message)}`;
}

export function ReportsOverview({
  financial,
  performance,
  churnRisk,
}: {
  financial: FinancialMetrics;
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
        <KpiCard label="Faturamento bruto" value={formatBRL(financial.total_revenue_cents)} />
        <KpiCard label="Ticket médio" value={formatBRL(financial.average_ticket_cents)} />
        <KpiCard label="Taxa de inadimplência" value={`${financial.default_rate}%`} tone="amber" />
        <KpiCard label="Consultas realizadas" value={String(financial.consultations_count)} />
        <KpiCard
          label="Taxa de faltas (no-show)"
          value={`${financial.no_show_rate}%`}
          tone={financial.no_show_rate >= HIGH_NO_SHOW_THRESHOLD ? 'red' : 'default'}
          alert={financial.no_show_rate >= HIGH_NO_SHOW_THRESHOLD}
        />
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
                        href={whatsappLink(patient)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                      >
                        <MessageCircle size={14} />
                        Chamar no WhatsApp
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
  alert = false,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'amber' | 'red';
  alert?: boolean;
}) {
  const toneClass =
    tone === 'amber' ? 'text-amber-600' : tone === 'red' ? 'text-red-600' : 'text-gray-800';

  return (
    <div
      className={`rounded-xl p-4 shadow-sm ${
        alert ? 'border border-red-200 bg-red-50' : 'bg-white'
      }`}
    >
      <p className={`text-xs ${alert ? 'text-red-500' : 'text-gray-400'}`}>{label}</p>
      <p className={`mt-1 text-xl font-semibold ${toneClass}`}>{value}</p>
      {alert && <p className="mt-1 text-[11px] text-red-500">Acima do aceitável — reforce as confirmações</p>}
    </div>
  );
}
