import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  FileSignature,
  PlayCircle,
  Receipt,
  ShieldCheck,
} from 'lucide-react';
import { FaqAccordion } from '@/components/marketing/faq-accordion';

const FEATURES = [
  {
    icon: FileSignature,
    title: 'Prontuário Inteligente e Assinatura Digital',
    description:
      'Modelos de evolução, editor de texto rico e assinatura eletrônica com hash SHA-256, IP e horário — validade jurídica sem papel.',
  },
  {
    icon: Bell,
    title: 'Lembretes por WhatsApp',
    description:
      'Disparo automático 24-48h antes da consulta direto para o paciente, reduzindo a taxa de faltas sem esforço manual da recepção.',
  },
  {
    icon: Receipt,
    title: 'Faturamento Automático',
    description:
      'Faturas, NFS-e e controle de inadimplência integrados à agenda — fechou a consulta, o financeiro se atualiza sozinho.',
  },
  {
    icon: ShieldCheck,
    title: 'Controle de Acessos (RLS)',
    description:
      'Isolamento de dados por clínica e por profissional a nível de banco de dados: cada usuário só acessa exatamente o que deveria.',
  },
];

const PLANS = [
  {
    name: 'Básico',
    planSlug: 'basico',
    price: 'Grátis',
    period: '',
    description: 'Para quem está começando a digitalizar a clínica.',
    users: 'Até 2 usuários',
    features: [
      'Prontuário eletrônico',
      'Agenda e pacientes ilimitados',
      'Faturamento e NFS-e',
      'Relatórios essenciais',
    ],
    highlight: false,
    tag: null,
    cta: 'Começar grátis',
  },
  {
    name: 'Profissional',
    planSlug: 'intermediario',
    price: 'R$ 99',
    period: '/mês',
    description: 'Para clínicas em crescimento com equipe maior.',
    users: 'Até 5 usuários',
    features: [
      'Tudo do plano Básico',
      'Lembretes automáticos por WhatsApp',
      'Assinatura eletrônica de documentos',
      'CRM e campanhas de relacionamento',
      'Relatórios inteligentes e gráficos avançados',
    ],
    highlight: true,
    tag: 'Mais Escolhido',
    cta: 'Assinar Profissional',
  },
  {
    name: 'Enterprise',
    planSlug: 'premium',
    price: 'R$ 199',
    period: '/mês',
    description: 'Para operações que não podem parar de crescer.',
    users: 'Usuários ilimitados',
    features: [
      'Tudo do plano Profissional',
      'Usuários ilimitados, sem bloqueio',
      'Central de conversas e atendimento',
      'Portal do paciente com link mágico',
      'Suporte prioritário',
    ],
    highlight: false,
    tag: null,
    cta: 'Assinar Enterprise',
  },
];

const FAQ_ITEMS = [
  {
    question: 'Preciso instalar algo?',
    answer:
      'Não. O clinic-app roda 100% no navegador, em qualquer computador, tablet ou celular. Basta acessar com login e senha — sem instalação, sem servidor local, sem atualização manual.',
  },
  {
    question: 'Meus dados estão seguros?',
    answer:
      'Sim. Cada clínica tem seus dados isolados a nível de banco de dados (Row Level Security), com criptografia em trânsito e em repouso, logs de auditoria e conformidade com a LGPD.',
  },
  {
    question: 'Posso importar pacientes de outro sistema?',
    answer:
      'Sim. O importador de pacientes em massa aceita arquivos CSV com mapeamento de colunas — basta exportar do seu sistema atual e subir o arquivo em poucos cliques.',
  },
];

export default function LandingPage() {
  return (
    <>
      <Hero />
      <SocialProof />
      <Features />
      <Pricing />
      <Faq />
    </>
  );
}

function Hero() {
  return (
    <section className="px-6 pb-20 pt-20 lg:px-8 lg:pt-28">
      <div className="mx-auto max-w-4xl text-center">
        <h1 className="text-balance text-4xl font-bold leading-[1.1] tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
          O software de gestão que sua clínica merece.{' '}
          <span className="text-brand-600">Simples, seguro e rentável.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-gray-500">
          Reduza faltas com lembretes automáticos por WhatsApp, mantenha o prontuário eletrônico
          organizado com assinatura digital e tenha o financeiro da clínica sob controle — tudo em
          uma única plataforma.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/signup"
            className="group flex items-center gap-2 rounded-lg bg-brand-600 px-7 py-3.5 text-base font-semibold text-white shadow-sm transition-all hover:bg-brand-700"
          >
            Teste Grátis
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a
            href="#funcionalidades"
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-7 py-3.5 text-base font-semibold text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50"
          >
            <PlayCircle className="h-4 w-4" />
            Ver Demonstração
          </a>
        </div>

        <p className="mt-5 text-xs text-gray-400">
          Sem cartão de crédito para começar · Cancele quando quiser
        </p>
      </div>
    </section>
  );
}

function SocialProof() {
  return (
    <section className="border-y border-gray-100 bg-gray-50 px-6 py-6 lg:px-8">
      <p className="text-center text-sm font-medium text-gray-500">
        Confiado por <span className="font-semibold text-gray-900">+1.200</span> profissionais de
        saúde em todo o Brasil
      </p>
    </section>
  );
}

function Features() {
  return (
    <section id="funcionalidades" className="px-6 py-24 lg:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">Funcionalidades</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Quatro pilares para uma clínica que roda sozinha
        </h2>
      </div>

      <div className="mx-auto mt-16 grid max-w-6xl grid-cols-1 gap-6 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <div
            key={feature.title}
            className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <feature.icon className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">{feature.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-gray-500">{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="precos" className="border-t border-gray-100 bg-gray-50 px-6 py-24 lg:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">Preços</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Um plano para cada momento da sua clínica
        </h2>
      </div>

      <div className="mx-auto mt-16 grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`relative flex flex-col rounded-2xl border p-8 ${
              plan.highlight
                ? 'border-brand-600 bg-white shadow-lg lg:-my-4 lg:py-12'
                : 'border-gray-200 bg-white shadow-sm'
            }`}
          >
            {plan.tag && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white">
                {plan.tag}
              </span>
            )}

            <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
            <p className="mt-1 text-sm text-gray-500">{plan.description}</p>

            <div className="mt-6 flex items-baseline gap-1">
              <span className="text-4xl font-bold text-gray-900">{plan.price}</span>
              <span className="text-sm text-gray-500">{plan.period}</span>
            </div>
            <p className="mt-2 text-sm font-medium text-brand-600">{plan.users}</p>

            <ul className="mt-8 flex flex-1 flex-col gap-3">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 text-sm text-gray-600">
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                  {feature}
                </li>
              ))}
            </ul>

            <Link
              href={`/signup?plan=${plan.planSlug}`}
              className={`mt-8 rounded-lg px-5 py-3 text-center text-sm font-semibold transition-colors ${
                plan.highlight
                  ? 'bg-brand-600 text-white hover:bg-brand-700'
                  : 'border border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              {plan.cta}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section id="faq" className="px-6 py-24 lg:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">FAQ</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Perguntas frequentes
        </h2>
      </div>

      <div className="mt-12">
        <FaqAccordion items={FAQ_ITEMS} />
      </div>
    </section>
  );
}
