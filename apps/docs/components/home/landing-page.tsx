import { Button } from '@vercel/geistdocs/components/button';
import {
  CommandPromptContent,
  CommandPromptCopy,
  CommandPromptList,
  CommandPromptPrefix,
  CommandPromptRoot,
  CommandPromptSurface,
  CommandPromptTrigger,
  CommandPromptTriggerDivider,
  CommandPromptViewport,
} from '@vercel/geistdocs/components/command-prompt';
import { LogoAiSdk } from '@vercel/geistdocs/assets/logos/logo-ai-sdk';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  ShieldCheck,
  ToggleRight,
} from 'lucide-react';
import Link from 'next/link';
import {
  NextIcon,
  SolidIcon,
  SvelteIcon,
} from '@/components/docs/template-icons';
import { NuxtIcon } from '@/components/docs/framework-icons';
import { PROMPT_TEMPLATES } from '@/lib/home/prompt-templates';
import { CodeExamplesSection } from './code-examples-section';
import { HeroInteractive } from './hero-interactive';
import { InstallCommand } from './install-command';
import { OssStatsSection } from './oss-stats-section';
import { AngularIcon, ReactIcon, VueIcon } from './framework-icons';
import { StarterPrompt } from './starter-prompt';

const frameworks = [
  { name: 'Next.js', Icon: NextIcon },
  { name: 'React', Icon: ReactIcon },
  { name: 'Svelte', Icon: SvelteIcon },
  { name: 'Angular', Icon: AngularIcon },
  { name: 'Vue', Icon: VueIcon },
  { name: 'Nuxt', Icon: NuxtIcon },
  { name: 'Solid', Icon: SolidIcon },
];
const features = [
  {
    title: 'Multi-provider support',
    description: 'Switch providers with one line of code.',
    Icon: ToggleRight,
  },
  {
    title: 'Streaming that just works',
    description: 'Real-time responses without custom parsing.',
    Icon: ArrowDown,
  },
  {
    title: 'Built-in fallbacks',
    description: 'Reliable production behavior by default.',
    Icon: ShieldCheck,
  },
];
const integrations = [
  {
    title: 'Vercel AI Gateway',
    description:
      'Access 100+ models with no markup or having to manage multiple API keys.',
    href: 'https://vercel.com/ai-gateway',
    command: 'npm i ai',
  },
  {
    title: 'Vercel Sandbox',
    description: 'Run agent-generated code securely and at scale.',
    href: 'https://vercel.com/sandbox',
    command: 'npm i @vercel/sandbox',
  },
  {
    title: 'Workflows',
    description:
      'Build long-running AI agents and apps that can suspend, resume, and survive function timeouts.',
    href: 'https://vercel.com/workflow',
    command: 'npm i workflow',
  },
  {
    title: 'AI Elements',
    description:
      'A UI component library and custom registry built to build AI-native applications faster.',
    href: 'https://elements.ai-sdk.dev',
    command: 'npx ai-elements',
  },
];
const testimonials = [
  {
    quote:
      'We built a full AI agent with 40+ tools, resumable streams, and multi-step reasoning on AI SDK. Every hard problem we’d solved with duct tape before, streaming, tool call repair, message management, tool based UI, they already had a clean API for. It feels like their team hit every wall we did, just before us.',
    name: 'Adir Duchan',
    role: 'Senior AI Engineer',
    company: 'Elementor',
  },
  {
    quote: 'OpenCode uses AI SDK.',
    name: 'Dax Raad',
    role: 'CEO & Founder',
    company: 'OpenCode',
  },
];

const sectionHeading = 'text-heading-32 lg:text-heading-48';
const card =
  'flex min-w-0 flex-col justify-between gap-8 rounded-lg border border-gray-alpha-400 bg-background-100 p-6 md:p-8';

export function LandingPage() {
  return (
    <main>
      <Link
        className="group flex items-center justify-center gap-x-2 gap-y-1 bg-gray-1000 px-4 py-3 text-center text-xs text-background-100 md:text-sm"
        href="/providers/ai-sdk-providers/xai"
        prefetch={true}
      >
        <span className="inline-flex shrink-0 items-center rounded-full bg-background-100/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide md:text-[11px]">
          New
        </span>
        <span className="text-pretty">
          Grok 4.7 is now available in the AI SDK.
        </span>
        <ArrowRight
          aria-hidden="true"
          className="hidden size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5 sm:inline-block"
        />
      </Link>
      <div className="mx-auto w-full max-w-[1448px] px-4 pb-12 sm:px-6 lg:pb-20">
        <section
          aria-labelledby="home-title"
          className="grid grid-cols-1 items-center gap-y-12 py-16 md:py-24 lg:grid-cols-12 lg:gap-x-12 lg:py-32"
        >
          <div className="flex flex-col items-start gap-8 lg:col-span-5">
            <h1
              className="text-balance text-heading-40 md:text-heading-48 xl:text-heading-64"
              id="home-title"
            >
              Universal AI layer for building frameworks and agents
            </h1>
            <p className="max-w-[64ch] text-pretty text-copy-18 text-gray-900">
              A unified TypeScript SDK for building AI apps with modern
              streaming, fallbacks, and multi-model support—powered by Vercel
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <Link
                className="shrink-0"
                href="/docs/introduction"
                prefetch={true}
              >
                <Button Component="span" className="rounded-full" size="large">
                  Read the docs
                </Button>
              </Link>
              <CommandPromptRoot
                className="flex w-auto flex-col items-start gap-2"
                defaultValue="humans"
              >
                <CommandPromptList>
                  <CommandPromptTrigger value="humans">
                    For humans
                  </CommandPromptTrigger>
                  <CommandPromptTriggerDivider />
                  <CommandPromptTrigger value="agents">
                    For agents
                  </CommandPromptTrigger>
                </CommandPromptList>
                <CommandPromptSurface className="h-10 py-0 pr-2">
                  <CommandPromptPrefix>$</CommandPromptPrefix>
                  <CommandPromptViewport>
                    <CommandPromptContent value="humans">
                      npm install ai
                    </CommandPromptContent>
                    <CommandPromptContent value="agents">
                      npx skills add vercel/ai
                    </CommandPromptContent>
                  </CommandPromptViewport>
                  <CommandPromptCopy aria-label="Copy install command" />
                </CommandPromptSurface>
              </CommandPromptRoot>
            </div>
          </div>
          <HeroInteractive className="lg:col-span-7" />
        </section>
        <OssStatsSection />
        <section
          aria-labelledby="home-frameworks"
          className="grid grid-cols-1 items-center gap-10 py-12 md:py-20 lg:grid-cols-12 lg:gap-x-12"
        >
          <div className="lg:col-span-5">
            <h2 className={sectionHeading} id="home-frameworks">
              The framework agnostic AI toolkit
            </h2>
            <p className="mt-4 max-w-xl text-pretty text-copy-18 text-gray-900">
              The open-source AI toolkit designed to help developers build
              AI-powered applications and agents with React, Next.js, Vue,
              Svelte, Node.js, and more.
            </p>
          </div>
          <ul className="flex flex-wrap items-center gap-6 lg:col-span-7 lg:flex-nowrap lg:justify-between lg:gap-0">
            {frameworks.map(({ name, Icon }) => (
              <li
                className="flex size-12 items-center justify-center [&_svg]:size-12"
                key={name}
                title={name}
              >
                <Icon />
                <span className="sr-only">{name}</span>
              </li>
            ))}
          </ul>
        </section>
        <section aria-label="AI SDK features" className="py-12 md:py-20">
          <ul className="grid gap-10 md:grid-cols-3 md:gap-12">
            {features.map(({ title, description, Icon }) => (
              <li className="flex flex-col gap-3" key={title}>
                <h3 className="flex items-center gap-2 text-copy-16 font-medium text-gray-900">
                  <Icon aria-hidden="true" size={16} />
                  {title}
                </h3>
                <p className="text-copy-18 text-gray-900">{description}</p>
              </li>
            ))}
          </ul>
        </section>
        <CodeExamplesSection />
        <section aria-labelledby="home-scale" className="py-12 md:py-20">
          <div className="grid grid-cols-1 items-end gap-4 lg:grid-cols-12 lg:gap-x-12">
            <h2 className={`${sectionHeading} lg:col-span-5`} id="home-scale">
              Scale with confidence
            </h2>
            <p className="text-pretty text-copy-18 text-gray-900 lg:col-span-5 lg:col-start-8">
              Plug the AI SDK into an entire ecosystem designed for modern AI
              applications that scale.
            </p>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {integrations.map(item => (
              <article className={card} key={item.title}>
                <div>
                  <a
                    className="flex items-center justify-between gap-3 text-heading-20 underline-offset-4 hover:underline"
                    href={item.href}
                  >
                    {item.title}
                    <ArrowUpRight aria-hidden="true" size={16} />
                  </a>
                  <p className="mt-3 text-copy-16 text-gray-900">
                    {item.description}
                  </p>
                </div>
                <InstallCommand command={item.command} />
              </article>
            ))}
          </div>
        </section>
        <section aria-labelledby="home-testimonials" className="py-12 md:py-20">
          <h2 className={sectionHeading} id="home-testimonials">
            What builders say about the AI SDK
          </h2>
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            {testimonials.map(item => (
              <figure
                className={`${card} justify-between gap-10`}
                key={item.name}
              >
                <blockquote className="text-pretty text-copy-20 text-gray-1000">
                  “{item.quote}”
                </blockquote>
                <figcaption className="flex flex-wrap items-end justify-between gap-4">
                  <span>
                    <strong className="font-medium">{item.name}</strong>
                    <span className="block text-sm text-gray-900">
                      {item.role}
                    </span>
                  </span>
                  <span
                    className={
                      item.company === 'OpenCode'
                        ? 'font-mono font-semibold'
                        : 'font-semibold'
                    }
                  >
                    {item.company}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
        <section aria-labelledby="home-get-started" className="py-12 md:py-20">
          <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
            <div>
              <h2
                className={`${sectionHeading} flex flex-wrap items-baseline gap-x-3`}
                id="home-get-started"
              >
                Build with the{' '}
                <span aria-label="AI SDK">
                  <LogoAiSdk className="h-7 w-auto lg:h-9" />
                </span>{' '}
                today
              </h2>
              <p className="mt-4 max-w-md text-copy-18 text-gray-900">
                Get started with the AI SDK by using our recipes or templates.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                className="shrink-0"
                href="/docs/introduction"
                prefetch={true}
              >
                <Button Component="span" className="rounded-full" size="large">
                  Read the docs
                </Button>
              </Link>
              <InstallCommand command="npm i ai" />
            </div>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {PROMPT_TEMPLATES.map(template => (
              <article className={card} key={template.title}>
                <div>
                  <h3 className="text-heading-20">
                    <a
                      className="underline-offset-4 hover:underline"
                      href={template.link}
                    >
                      {template.title}
                    </a>
                  </h3>
                  <p className="mt-3 text-copy-16 text-gray-900">
                    {template.description}
                  </p>
                </div>
                <StarterPrompt text={template.prompt} />
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
