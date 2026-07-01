import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Bell,
  CalendarCheck2,
  FileSignature,
  Receipt,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  TrendingUp,
  Users,
} from 'lucide-react';
import { MobileNav } from '@/components/marketing/mobile-nav';

const FEATURES = [
  {
    icon: Receipt,
    title: 'NFS-e no automático',
    description:
      'Emissão de notas fiscais de serviço integrada ao seu faturamento. Fechou a consulta, a nota sai sozinha — sem planilha, sem contador no meio do caminho, sem risco de multa por atraso.',
  },
  {
    icon: FileSignature,
    title: 'Prontuário + assinatura eletrônica',
    description:
      'Prontuários eletrônicos com validade jurídica: hash SHA-256, IP e horário do assinante gravados de forma imutável. Pronto para auditoria de CRM/CRO, sem papel e sem gaveta.',
  },
  {
    icon: ShieldCheck,
    title: 'Segurança de nível bancário + LGPD',
    description:
      'Isolamento total de dados por clínica via Row Level Security, logs de auditoria em cada alteração sensível e portabilidade de dados sob demanda. Conformidade que resiste a auditoria.',
  },
];

const PLANS = [
  {
    name: 'Básico',
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
    cta: 'Começar grátis',
  },
  {
    name: 'Intermediário',
    price: 'R$ 99',
    period: '/mês',
    description: 'Para clínicas em crescimento com equipe maior.',
    users: 'Até 5 usuários',
    features: [
      'Tudo do plano Básico',
      'Assinatura eletrônica de documentos',
      'CRM e campanhas de relacionamento',
      'Gráficos avançados e adiantamentos',
      'Loja e pedidos de laboratório',
    ],
    highlight: false,
    cta: 'Assinar Intermediário',
  },
  {
    name: 'Premium',
    price: 'R$ 199',
    period: '/mês',
    description: 'Para operações que não podem parar de crescer.',
    users: 'Usuários ilimitados',
    features: [
      'Tudo do plano Intermediário',
      'Usuários ilimitados, sem bloqueio',
      'Central de conversas e atendimento',
      'Suporte prioritário',
      '7 dias de teste grátis',
    ],
    highlight: true,
    cta: 'Assinar Premium',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-ink text-gray-100 antialiased">
      <Header />
      <main>
        <Hero />
        <LogoStrip />
        <Features />
        <Pricing />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-electric-500 shadow-glow">
        <Activity className="h-4.5 w-4.5 text-white" strokeWidth={2.5} />
      </div>
      <span className="text-lg font-semibold tracking-tight text-white">
        clinic<span className="text-electric-400">-app</span>
      </span>
    </Link>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-ink/80 backdrop-blur-md">
      <div className="relative mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
        <Logo />
        <nav className="hidden items-center gap-8 text-sm font-medium text-gray-400 md:flex">
          <a href="#recursos" className="transition-colors hover:text-white">Recursos</a>
          <a href="#planos" className="transition-colors hover:text-white">Planos</a>
          <Link href="/login" className="transition-colors hover:text-white">Entrar</Link>
        </nav>
        <div className="hidden md:block">
          <Link
            href="/signup"
            className="rounded-lg bg-electric-500 px-4 py-2 text-sm font-semibold text-white shadow-glow transition-transform hover:scale-[1.03] hover:bg-electric-600"
          >
            Iniciar Teste Grátis
          </Link>
        </div>
        <MobileNav />
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pb-24 pt-20 lg:px-8 lg:pt-28">
      {/* ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[560px] w-[560px] -translate-x-1/2 rounded-full bg-electric-500/20 blur-[120px]"
      />

      <div className="relative mx-auto max-w-4xl text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-electric-500/30 bg-electric-500/10 px-4 py-1.5 text-xs font-medium text-electric-400">
          <Sparkles className="h-3.5 w-3.5" />
          Gestão de clínicas sem burocracia
        </div>

        <h1 className="text-balance text-4xl font-bold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl">
          Sua clínica sai da planilha e entra em{' '}
          <span className="bg-gradient-to-r from-electric-400 to-electric-600 bg-clip-text text-transparent">
            piloto automático
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-gray-400">
          Prontuário eletrônico, emissão automática de NFS-e, assinatura digital com validade
          jurídica e conformidade LGPD — tudo em uma única plataforma, sem papel, sem retrabalho
          e sem depender de três sistemas que não conversam entre si.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/signup"
            className="group flex items-center gap-2 rounded-lg bg-electric-500 px-7 py-3.5 text-base font-semibold text-white shadow-glow transition-all hover:scale-[1.03] hover:bg-electric-600"
          >
            Iniciar Teste Grátis de 7 Dias
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a
            href="#planos"
            className="rounded-lg border border-white/10 px-7 py-3.5 text-base font-semibold text-gray-200 transition-colors hover:border-white/20 hover:bg-white/5"
          >
            Ver planos e preços
          </a>
        </div>

        <p className="mt-5 text-xs text-gray-500">
          Sem cartão de crédito para começar · Cancele quando quiser
        </p>
      </div>

      <DashboardMockup />
    </section>
  );
}

function DashboardMockup() {
  return (
    <div className="relative mx-auto mt-20 max-w-5xl">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-4 rounded-[2rem] bg-electric-500/10 blur-3xl"
      />
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-ink-800 shadow-2xl">
        {/* fake window chrome */}
        <div className="flex items-center gap-2 border-b border-white/5 bg-white/[0.02] px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-gray-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-gray-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-gray-700" />
          <span className="ml-3 text-xs text-gray-600">app.clinic-app.com/dashboard</span>
        </div>

        <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-3">
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs text-gray-500">Faturamento do mês</p>
              <TrendingUp className="h-4 w-4 text-electric-400" />
            </div>
            <p className="text-2xl font-bold text-white">R$ 48.230</p>
            <p className="mt-1 text-xs text-emerald-400">+18% vs. mês anterior</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs text-gray-500">Consultas hoje</p>
              <CalendarCheck2 className="h-4 w-4 text-electric-400" />
            </div>
            <p className="text-2xl font-bold text-white">27</p>
            <p className="mt-1 text-xs text-gray-500">4 encaixes disponíveis</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs text-gray-500">NFS-e emitidas</p>
              <Receipt className="h-4 w-4 text-electric-400" />
            </div>
            <p className="text-2xl font-bold text-white">312</p>
            <p className="mt-1 text-xs text-gray-500">100% automatizadas</p>
          </div>

          <div className="col-span-1 rounded-xl border border-white/5 bg-white/[0.02] p-4 md:col-span-2">
            <p className="mb-4 text-xs text-gray-500">Prontuários assinados na semana</p>
            <div className="flex h-32 items-end gap-2">
              {[40, 65, 50, 80, 60, 95, 70].map((h, i) => (
                <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-electric-600/40 to-electric-400" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <p className="mb-3 text-xs text-gray-500">Última atividade</p>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5 text-xs">
                <FileSignature className="h-4 w-4 shrink-0 text-electric-400" />
                <span className="text-gray-300">Termo de consentimento assinado</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs">
                <Receipt className="h-4 w-4 shrink-0 text-electric-400" />
                <span className="text-gray-300">NFS-e #0312 emitida</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs">
                <Bell className="h-4 w-4 shrink-0 text-electric-400" />
                <span className="text-gray-300">Lembrete enviado ao paciente</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LogoStrip() {
  return (
    <section className="border-y border-white/5 bg-white/[0.015] px-6 py-8 lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-10 gap-y-3 text-center text-sm text-gray-500">
        <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-electric-400" /> Conformidade LGPD</span>
        <span className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-electric-400" /> Validade jurídica CFM/CRO</span>
        <span className="flex items-center gap-2"><Stethoscope className="h-4 w-4 text-electric-400" /> Feito para clínicas e consultórios</span>
        <span className="flex items-center gap-2"><Users className="h-4 w-4 text-electric-400" /> Multi-usuário e multi-unidade</span>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="recursos" className="px-6 py-28 lg:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-electric-400">Recursos</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Tecnologia que resolve a burocracia, não que cria mais uma
        </h2>
        <p className="mt-4 text-lg text-gray-400">
          Três pilares que tiram sua equipe da papelada e colocam o foco de volta no paciente.
        </p>
      </div>

      <div className="mx-auto mt-16 grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-3">
        {FEATURES.map((feature) => (
          <div
            key={feature.title}
            className="group rounded-2xl border border-white/5 bg-ink-800 p-8 transition-colors hover:border-electric-500/30"
          >
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-electric-500/10 text-electric-400 transition-colors group-hover:bg-electric-500/20">
              <feature.icon className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold text-white">{feature.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-gray-400">{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="planos" className="border-t border-white/5 px-6 py-28 lg:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-electric-400">Planos</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Um plano para cada momento da sua clínica
        </h2>
        <p className="mt-4 text-lg text-gray-400">
          Comece grátis, cresça sem trocar de sistema. 7 dias de teste em qualquer plano pago.
        </p>
      </div>

      <div className="mx-auto mt-16 grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`relative flex flex-col rounded-2xl border p-8 ${
              plan.highlight
                ? 'border-electric-500 bg-gradient-to-b from-electric-500/10 to-ink-800 shadow-glow'
                : 'border-white/5 bg-ink-800'
            }`}
          >
            {plan.highlight && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-electric-500 px-3 py-1 text-xs font-semibold text-white shadow-glow">
                Mais escolhido
              </span>
            )}

            <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
            <p className="mt-1 text-sm text-gray-500">{plan.description}</p>

            <div className="mt-6 flex items-baseline gap-1">
              <span className="text-4xl font-bold text-white">{plan.price}</span>
              <span className="text-sm text-gray-500">{plan.period}</span>
            </div>
            <p className="mt-2 text-sm font-medium text-electric-400">{plan.users}</p>

            <ul className="mt-8 flex flex-1 flex-col gap-3">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 text-sm text-gray-300">
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-electric-400" />
                  {feature}
                </li>
              ))}
            </ul>

            <Link
              href="/signup"
              className={`mt-8 rounded-lg px-5 py-3 text-center text-sm font-semibold transition-all ${
                plan.highlight
                  ? 'bg-electric-500 text-white shadow-glow hover:scale-[1.02] hover:bg-electric-600'
                  : 'border border-white/10 text-gray-200 hover:border-white/20 hover:bg-white/5'
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

function FinalCta() {
  return (
    <section className="px-6 pb-28 lg:px-8">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-electric-500/20 bg-gradient-to-br from-ink-800 via-ink-800 to-electric-500/10 px-8 py-16 text-center sm:px-16">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-electric-500/20 blur-[100px]"
        />
        <div className="relative">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Sua clínica não precisa mais rodar no improviso
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-gray-400">
            Migre para o clinic-app hoje e emita sua primeira NFS-e automática ainda esta semana.
            O teste grátis de 7 dias não pede cartão de crédito.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/signup"
              className="group flex items-center gap-2 rounded-lg bg-electric-500 px-8 py-3.5 text-base font-semibold text-white shadow-glow transition-all hover:scale-[1.03] hover:bg-electric-600"
            >
              Iniciar Teste Grátis
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/login"
              className="text-sm font-semibold text-gray-400 transition-colors hover:text-white"
            >
              Já tenho conta →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/5 px-6 py-10 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
        <Logo />
        <p className="text-xs text-gray-600">
          © {new Date().getFullYear()} clinic-app. Todos os direitos reservados.
        </p>
        <div className="flex items-center gap-6 text-xs text-gray-500">
          <a href="#recursos" className="hover:text-white">Recursos</a>
          <a href="#planos" className="hover:text-white">Planos</a>
          <Link href="/login" className="hover:text-white">Entrar</Link>
        </div>
      </div>
    </footer>
  );
}
