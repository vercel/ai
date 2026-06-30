export const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Painel',
  patients: 'Pacientes',
  appointments: 'Agendamentos',
  billing: 'Financeiro',
  fiscal_notes: 'Notas fiscais',
  reports: 'Relatórios',
  campaigns: 'Campanhas',
  signatures: 'Assinatura eletrônica',
  crm: 'CRM',
  charts: 'Gráficos',
  lab_orders: 'Controle laboratório',
  cash_advances: 'Adiantamentos',
  store: 'Loja',
  conversations: 'Conversas',
};

export const PLAN_SLUGS = ['basico', 'intermediario', 'premium'] as const;
export type PlanSlug = (typeof PLAN_SLUGS)[number];
