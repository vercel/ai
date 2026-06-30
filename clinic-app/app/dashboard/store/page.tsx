import Link from 'next/link';
import { StoreTabs } from './store-tabs';

type StoreItem = {
  name: string;
  description: string;
  badge: 'Incluso no Premium' | 'Contratado à parte' | 'Novo';
  href?: string;
};

const STORE_ITEMS: StoreItem[] = [
  {
    name: 'Campanhas',
    description: 'Envie campanhas de marketing por e-mail, SMS e WhatsApp para sua base de pacientes.',
    badge: 'Incluso no Premium',
    href: '/dashboard/campaigns/panel',
  },
  {
    name: 'WhatsApp Automático Oficial',
    description: 'Atendimento e automações via API oficial do WhatsApp Business.',
    badge: 'Novo',
  },
  {
    name: 'CRM de vendas',
    description: 'Gerencie leads e oportunidades em um funil de vendas completo.',
    badge: 'Incluso no Premium',
    href: '/dashboard/crm',
  },
  {
    name: 'Assinatura eletrônica',
    description: 'Solicite e acompanhe assinaturas de documentos, termos e contratos.',
    badge: 'Incluso no Premium',
    href: '/dashboard/signatures',
  },
  {
    name: 'Certificado digital A1',
    description: 'Emita notas fiscais e documentos com certificado digital integrado.',
    badge: 'Contratado à parte',
  },
  {
    name: 'Conversas',
    description: 'Central de conversas com assistente de IA para automatizar atendimentos.',
    badge: 'Contratado à parte',
    href: '/dashboard/conversations',
  },
  {
    name: 'PIX automatizado',
    description: 'Receba pagamentos via PIX com conciliação automática.',
    badge: 'Incluso no Premium',
  },
  {
    name: 'Boleto bancário',
    description: 'Gere e acompanhe boletos bancários para seus pacientes.',
    badge: 'Incluso no Premium',
  },
  {
    name: 'Link de pagamento',
    description: 'Crie links de pagamento para cobranças avulsas.',
    badge: 'Incluso no Premium',
  },
  {
    name: 'Emissão de NFS-e',
    description: 'Emita notas fiscais de serviço eletrônicas diretamente pelo sistema.',
    badge: 'Incluso no Premium',
    href: '/dashboard/fiscal-notes',
  },
];

const BADGE_COLORS: Record<StoreItem['badge'], string> = {
  'Incluso no Premium': 'bg-brand-50 text-brand-700',
  'Contratado à parte': 'bg-amber-50 text-amber-700',
  Novo: 'bg-blue-50 text-blue-700',
};

export default function StorePage() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Loja de Módulos</h1>
          <p className="text-sm text-gray-500">
            Conheça os módulos e add-ons disponíveis para o seu plano.
          </p>
        </div>
        <Link
          href="/dashboard/store/products"
          className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Gerenciar produtos
        </Link>
      </div>

      <StoreTabs />

      <p className="mb-4 rounded bg-amber-50 p-3 text-xs text-amber-700">
        Catálogo de módulos contratáveis (não é uma loja de produtos físicos). A contratação
        efetiva de itens "Contratado à parte" depende de integração com um provedor de
        pagamentos/billing ainda não configurado.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {STORE_ITEMS.map((item) => (
          <div key={item.name} className="flex flex-col gap-2 rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-gray-800">{item.name}</p>
              <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${BADGE_COLORS[item.badge]}`}>
                {item.badge}
              </span>
            </div>
            <p className="text-xs text-gray-500">{item.description}</p>
            {item.href ? (
              <Link
                href={item.href}
                className="mt-1 self-start text-xs font-medium text-brand-600 hover:underline"
              >
                Saiba mais
              </Link>
            ) : (
              <span className="mt-1 text-xs text-gray-400">Saiba mais (em breve)</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
