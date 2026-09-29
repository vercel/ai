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
import { ArrowUpRight, Sparkles } from 'lucide-react';
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
import styles from './home.module.css';

const frameworks = [
  { name: 'Next.js', Icon: NextIcon },
  { name: 'React', Icon: ReactIcon },
  { name: 'Svelte', Icon: SvelteIcon },
  { name: 'Angular', Icon: AngularIcon },
  { name: 'Vue', Icon: VueIcon },
  { name: 'Nuxt', Icon: NuxtIcon },
  { name: 'Solid', Icon: SolidIcon },
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

export function LandingPage() {
  return (
    <main className={styles.home}>
      <aside className="flex items-center justify-center gap-2 border-b border-blue-300 bg-blue-100 px-4 py-3 text-center text-sm text-blue-900">
        <Sparkles aria-hidden="true" className="shrink-0" size={18} />
        <p>
          Grok 4.7 is now available in the AI SDK.{' '}
          <Link
            className="font-medium text-gray-1000 underline-offset-4 hover:underline"
            href="/providers/ai-sdk-providers/xai"
            prefetch={true}
          >
            Learn more.
          </Link>
        </p>
      </aside>
      <section
        aria-labelledby="home-title"
        className="flex flex-col items-center px-4 py-28 sm:py-48"
      >
        <h1
          className="max-w-5xl text-center text-heading-40 md:text-heading-48 lg:text-heading-64"
          id="home-title"
        >
          Universal AI layer for building frameworks and agents
        </h1>
        <p className="mt-5 max-w-2xl text-center text-copy-16 text-gray-900 md:text-copy-18 lg:text-copy-20">
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
        <HeroInteractive />
      </section>
      <div className={styles.grid}>
        <OssStatsSection />
        <section
          aria-labelledby="home-frameworks"
          className="px-6 py-20 text-center"
        >
          <h2
            className="text-heading-32 md:text-heading-40"
            id="home-frameworks"
          >
            The Framework Agnostic AI Toolkit
          </h2>
          <p className="mx-auto mt-8 max-w-3xl text-copy-16 text-gray-900 md:text-copy-18 lg:text-copy-20">
            The open-source AI toolkit designed to help developers build
            AI-powered applications and agents with React, Next.js, Vue, Svelte,
            Node.js, and more.
          </p>
          <ul className="mt-10 flex flex-wrap items-center justify-center gap-8">
            {frameworks.map(({ name, Icon }) => (
              <li className="flex flex-col items-center gap-2" key={name}>
                <span
                  aria-hidden="true"
                  className="flex size-12 items-center justify-center [&_svg]:size-12"
                >
                  <Icon />
                </span>
                <span className="text-xs text-gray-900">{name}</span>
              </li>
            ))}
          </ul>
        </section>
        <div className={styles.features}>
          {[
            [
              'Multi-provider support.',
              'Switch providers with one line of code.',
            ],
            [
              'Streaming that just works.',
              'Real-time responses without custom parsing.',
            ],
            ['Built-in fallbacks.', 'Reliable production behavior by default.'],
          ].map(([title, description]) => (
            <p className={`${styles.cell} text-heading-20`} key={title}>
              {title}{' '}
              <span className="font-medium text-gray-900">{description}</span>
            </p>
          ))}
        </div>
        <CodeExamplesSection />
        <section aria-labelledby="home-scale" className={styles.integrations}>
          <div className={`${styles.cell} ${styles.integrationIntro}`}>
            <h2 className="text-heading-24" id="home-scale">
              Scale with confidence
            </h2>
            <p className="mt-4 text-copy-16 text-gray-900">
              Plug the AI SDK into an entire ecosystem designed for modern AI
              applications that scale.
            </p>
          </div>
          {integrations.map(item => (
            <article
              className={`${styles.cell} flex min-w-0 flex-col justify-between gap-8`}
              key={item.title}
            >
              <div>
                <a
                  className="flex items-center justify-between gap-3 font-mono text-base underline-offset-4 hover:underline"
                  href={item.href}
                >
                  {item.title}
                  <ArrowUpRight aria-hidden="true" size={16} />
                </a>
                <p className="mt-3 text-sm text-gray-900">{item.description}</p>
              </div>
              <InstallCommand command={item.command} />
            </article>
          ))}
        </section>
        <section aria-label="What builders say" className={styles.testimonials}>
          <figure
            className={`${styles.cell} flex flex-col justify-between gap-10`}
          >
            <blockquote className="text-copy-18 text-gray-900">
              <span
                aria-hidden="true"
                className="mb-4 block text-5xl text-gray-400"
              >
                “
              </span>
              We built a full AI agent with 40+ tools, resumable streams, and
              multi-step reasoning on AI SDK. Every hard problem we’d solved
              with duct tape before, streaming, tool call repair, message
              management, tool based UI, they already had a clean API for. It
              feels like their team hit every wall we did, just before us.
            </blockquote>
            <figcaption className="flex flex-wrap justify-between gap-4">
              <span>
                <strong className="font-medium">Adir Duchan</strong>
                <span className="block text-sm text-gray-900">
                  Senior AI Engineer
                </span>
              </span>
              <span className="font-semibold">Elementor</span>
            </figcaption>
          </figure>
          <figure
            className={`${styles.cell} flex flex-col justify-between gap-10`}
          >
            <blockquote className="text-copy-18 text-gray-900">
              <span
                aria-hidden="true"
                className="mb-4 block text-5xl text-gray-400"
              >
                “
              </span>
              OpenCode uses AI SDK.
            </blockquote>
            <figcaption className="flex flex-wrap justify-between gap-4">
              <span>
                <strong className="font-medium">Dax Raad</strong>
                <span className="block text-sm text-gray-900">
                  CEO &amp; Founder
                </span>
              </span>
              <span className="font-mono font-semibold">OpenCode</span>
            </figcaption>
          </figure>
        </section>
        <section aria-labelledby="home-get-started">
          <div
            className={`${styles.cell} flex flex-wrap items-start justify-between gap-8`}
          >
            <div>
              <h2
                className="flex flex-wrap items-baseline gap-2 text-heading-32"
                id="home-get-started"
              >
                Build with our{' '}
                <span aria-label="AI SDK">
                  <LogoAiSdk className="h-6 w-auto" />
                </span>{' '}
                today
              </h2>
              <p className="mt-4 max-w-sm text-copy-18 text-gray-900">
                Get started with the AI SDK by using our recipes or templates.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                className="rounded-full bg-gray-1000 px-5 py-3 text-sm font-medium text-background-100"
                href="/docs/introduction"
                prefetch={true}
              >
                Visit Documentation
              </Link>
              <InstallCommand command="npm i ai" />
            </div>
          </div>
          <div className={styles.features}>
            {PROMPT_TEMPLATES.map(template => (
              <article
                className={`${styles.cell} flex min-w-0 flex-col justify-between gap-8`}
                key={template.title}
              >
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
