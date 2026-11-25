import { Badge } from '@vercel/geistdocs/components/badge';
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
import { LogoIconAngularSvg } from '@vercel/geistdocs/assets/logos/logo-icon-angular-svg';
import { LogoIconNuxtSvg } from '@vercel/geistdocs/assets/logos/logo-icon-nuxt-svg';
import { LogoIconReactSvg } from '@vercel/geistdocs/assets/logos/logo-icon-react-svg';
import { LogoIconSolidstartSvg } from '@vercel/geistdocs/assets/logos/logo-icon-solidstart-svg';
import { LogoIconSvelteSvg } from '@vercel/geistdocs/assets/logos/logo-icon-svelte-svg';
import { LogoIconVueSvg } from '@vercel/geistdocs/assets/logos/logo-icon-vue-svg';
import { LogoNextJs } from '@vercel/geistdocs/assets/logos/logo-next-js';
import { IconArrowDown } from '@vercel/geistdocs/assets/icons/icon-arrow-down';
import { IconRoute } from '@vercel/geistdocs/assets/icons/icon-route';
import { IconShieldCheck } from '@vercel/geistdocs/assets/icons/icon-shield-check';
import { IconToggleOn } from '@vercel/geistdocs/assets/icons/icon-toggle-on';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PROMPT_TEMPLATES } from '@/lib/home/prompt-templates';
import { CardSnippet } from './card-snippet';
import { LogoElementor, LogoOpencode } from './company-logos';
import { CodeExamplesSection } from './code-examples';
import { HeroInteractive } from './hero-interactive';
import { InstallCommand } from './install-command';
import { OssStatsSection } from './oss-stats-section';

const frameworks = [
  { name: 'Next.js', logo: <LogoNextJs height={48} /> },
  { name: 'React', logo: <LogoIconReactSvg size={48} /> },
  { name: 'Svelte', logo: <LogoIconSvelteSvg size={48} /> },
  { name: 'Angular', logo: <LogoIconAngularSvg size={48} /> },
  { name: 'Vue', logo: <LogoIconVueSvg size={48} /> },
  { name: 'Nuxt', logo: <LogoIconNuxtSvg size={48} /> },
  { name: 'Solid', logo: <LogoIconSolidstartSvg size={48} /> },
];
const features = [
  {
    title: 'Multi-provider support',
    description: 'Switch providers with one line of code.',
    Icon: IconToggleOn,
  },
  {
    title: 'Streaming that just works',
    description: 'Real-time responses without custom parsing.',
    Icon: IconArrowDown,
  },
  {
    title: 'Built-in fallbacks',
    description: 'Reliable production behavior by default.',
    Icon: IconShieldCheck,
  },
  {
    title: 'AI Gateway compatible',
    description: 'Route to any model through one endpoint.',
    Icon: IconRoute,
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
    badge: 'NEW',
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
      'We built a full AI agent with 40+ tools, resumable streams, and multi-step reasoning on AI SDK. Every hard problem we’d solved with duct tape before, streaming, tool call repair, message management, tool based UI, they already had a clean API for.',
    name: 'Adir Duchan',
    role: 'Senior AI Engineer',
    company: 'Elementor',
    Logo: LogoElementor,
  },
  {
    quote: 'OpenCode uses AI SDK.',
    name: 'Dax Raad',
    role: 'CEO & Founder',
    company: 'OpenCode',
    Logo: LogoOpencode,
  },
];

const sectionHeading = 'text-heading-32 lg:text-heading-48';

/** Linked card with a copy snippet, styled after the Chat SDK and vercel.com. */
function LinkCard({
  title,
  description,
  href,
  badge,
  children,
}: {
  title: string;
  description: string;
  href: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <a
      className="flex flex-col gap-8 rounded-xs border border-gray-300 p-8 no-underline transition-colors outline-none hover:border-gray-500 focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 has-[[data-card-snippet]:hover]:border-gray-300"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      <div className="flex h-full flex-col justify-between gap-2 lg:gap-3">
        <div className="flex flex-col gap-3">
          <span className="flex items-center gap-2 text-heading-16 font-medium! text-gray-1000 sm:text-heading-20">
            {title}
            {badge ? (
              <Badge size="sm" variant="inverted">
                {badge}
              </Badge>
            ) : null}
          </span>
          <span className="max-w-[32ch] text-copy-16 text-balance text-gray-900">
            {description}
          </span>
        </div>
        {children}
      </div>
    </a>
  );
}

export function LandingPage() {
  return (
    <main>
      <div className="mx-auto w-full max-w-[1448px] px-4 pb-12 sm:px-6 lg:pb-20">
        <section
          aria-labelledby="home-title"
          className="flex flex-col items-center py-16 md:py-24 lg:py-32"
        >
          <h1
            className="max-w-5xl text-balance text-center text-heading-40 md:text-heading-48 lg:text-heading-64"
            id="home-title"
          >
            Universal AI layer for building frameworks and agents
          </h1>
          <p className="mt-5 max-w-2xl text-pretty text-center text-copy-16 text-gray-900 md:text-copy-18 lg:text-copy-20">
            A unified TypeScript SDK for building AI apps with modern streaming,
            fallbacks, and multi-model support—powered by Vercel
          </p>
          <CommandPromptRoot
            className="mt-8 flex w-full flex-col items-center gap-2"
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
            <CommandPromptSurface>
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
          <HeroInteractive className="mt-16 w-full md:mt-20" />
        </section>
        <OssStatsSection />
        <section
          aria-labelledby="home-frameworks"
          className="grid grid-cols-1 items-center gap-y-4 py-12 md:py-20 lg:grid-cols-12 lg:gap-x-12"
        >
          {/* The heading and logos share the first row so the logos center on
              the heading; the description sits below the heading. */}
          <h2
            className={`${sectionHeading} text-balance lg:col-span-4`}
            id="home-frameworks"
          >
            The framework agnostic AI toolkit
          </h2>
          <p className="max-w-md text-pretty text-copy-18 text-gray-900 lg:col-span-4 lg:row-start-2">
            The open-source AI toolkit designed to help developers build
            AI-powered applications and agents with React, Next.js, Vue, Svelte,
            Node.js, and more.
          </p>
          <ul className="mt-6 flex flex-wrap items-center gap-6 lg:col-span-7 lg:col-start-6 lg:row-start-1 lg:mt-0 lg:flex-nowrap lg:justify-between lg:gap-0">
            {frameworks.map(({ name, logo }) => (
              <li
                className="flex size-12 items-center justify-center"
                key={name}
                title={name}
              >
                {logo}
                <span className="sr-only">{name}</span>
              </li>
            ))}
          </ul>
        </section>
        <section aria-label="AI SDK features" className="py-12 md:py-20">
          <ul className="grid gap-10 md:grid-cols-2 md:gap-x-8 lg:grid-cols-4">
            {features.map(({ title, description, Icon }) => (
              <li className="flex flex-col gap-3" key={title}>
                <h3 className="flex items-center gap-2 text-copy-16 font-medium text-gray-900">
                  <Icon aria-hidden="true" size={16} />
                  {title}
                </h3>
                <p className="text-copy-18 text-gray-900 lg:max-w-[200px]">
                  {description}
                </p>
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
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4 lg:gap-x-6">
            {integrations.map(({ command, ...item }) => (
              <LinkCard key={item.title} {...item}>
                <CardSnippet text={command} />
              </LinkCard>
            ))}
          </div>
        </section>
        {/* Pull-out quotes, styled like the quote on vercel.com/ai-sdk. */}
        <section
          aria-labelledby="home-testimonials"
          className="grid gap-24 py-24 lg:grid-cols-2 lg:gap-x-24"
        >
          <h2 className="sr-only" id="home-testimonials">
            What builders say about the AI SDK
          </h2>
          {testimonials.map(item => (
            // Left-aligned like the compact pull-out quote on vercel.com, with
            // the opening mark hung in the margin so the text edge stays flush.
            <figure
              className="m-0 flex flex-col justify-between gap-6 md:gap-9"
              key={item.name}
            >
              <blockquote className="m-0 max-w-[44ch] text-left text-heading-24 font-normal! text-pretty text-gray-1000 lg:text-heading-32">
                <span className="-ml-[0.45em] inline-block w-[0.45em] text-right">
                  &ldquo;
                </span>
                {item.quote}
                <span className="tracking-[-0.02em]">&rdquo;</span>
              </blockquote>
              <figcaption className="flex items-end justify-between gap-6">
                <span className="flex flex-col gap-1 font-sans text-label-14 font-medium">
                  <span className="text-gray-1000">{item.name}</span>
                  <span className="font-normal text-gray-900">
                    {item.role}, {item.company}
                  </span>
                </span>
                <item.Logo className="shrink-0 text-gray-1000" height={18} />
              </figcaption>
            </figure>
          ))}
        </section>
        <section aria-labelledby="home-get-started" className="py-12 md:py-20">
          <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
            <div>
              {/* "SDK" is a CSS pill sized in ems, as in the vercel.com/ai-sdk
                  and /ai-gateway headings, so "AI" keeps the heading's weight. */}
              <h2 className={sectionHeading} id="home-get-started">
                Build with the AI{' '}
                <span className="relative -top-1 inline-flex items-center rounded-full border-[3px] border-gray-1000 bg-background-200 px-[0.3em] py-[0.03em] align-middle text-[0.6em] leading-none font-semibold tracking-[-0.037em] uppercase lg:border-4">
                  SDK
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
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-x-6">
            {PROMPT_TEMPLATES.map(template => (
              <LinkCard
                description={template.description}
                href={template.link}
                key={template.title}
                title={template.title}
              >
                <CardSnippet
                  label="Copy install prompt"
                  text={template.prompt}
                />
              </LinkCard>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
