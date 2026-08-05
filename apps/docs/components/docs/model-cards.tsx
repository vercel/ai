import { Badge } from '@vercel/geistdocs/components/badge';
import {
  IconApi,
  IconDisplay,
  IconLogs,
  IconSandbox,
  IconSparkles,
  IconWrench,
} from '@vercel/geistdocs/assets/icons';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ResolveHref } from '@/components/docs/resolve-href';

/**
 * Capability flags shown as badges on a provider card. Mirrors the
 * production ai-sdk.dev model cards.
 */
interface ModelFeatures {
  image?: boolean;
  imageGeneration?: boolean;
  object?: boolean;
  stream?: boolean;
  tool?: boolean;
}

interface ModelLogo {
  /** Invert in dark mode (monochrome black marks). */
  invert?: boolean;
  src: string;
}

interface ModelCardData {
  color: string;
  features: ModelFeatures;
  href: string;
  /** Static logo asset under public/images/icons. */
  logo?: ModelLogo;
  /** Inline logo component (used when no static asset exists). */
  logoIcon?: (props: { size?: number }) => ReactNode;
  title: string;
  /** Provider paths that differ in specific documentation versions. */
  versionedHrefs?: Record<string, string>;
}

const FEATURE_BADGES: [
  keyof ModelFeatures,
  string,
  (props: { className?: string }) => ReactNode,
][] = [
  ['image', 'Image Input', IconDisplay],
  ['imageGeneration', 'Image Generation', IconSparkles],
  ['object', 'Object Generation', IconApi],
  ['tool', 'Tool Usage', IconWrench],
  ['stream', 'Tool Streaming', IconLogs],
];

const FeatureBadges = ({ features }: { features: ModelFeatures }) => {
  const active = FEATURE_BADGES.filter(([key]) => features[key]);
  return (
    <div className="flex w-full flex-row flex-wrap gap-2">
      {active.map(([key, label, Icon]) => (
        <Badge
          className="gap-1 border-none bg-gray-200 font-normal text-gray-900"
          key={key}
          variant="secondary"
        >
          <Icon className="size-3.5" />
          {label}
        </Badge>
      ))}
      {active.length === 0 ? (
        <Badge
          className="gap-1 border-none bg-gray-200 font-normal text-gray-900"
          variant="secondary"
        >
          <IconSandbox className="size-3.5" />
          Provider Dependent
        </Badge>
      ) : null}
    </div>
  );
};

/** Large-initial fallback for providers without an embeddable logo. */
const Monogram = ({ title }: { title: string }) => (
  <span
    aria-hidden
    className="flex size-16 items-center justify-center rounded-2xl border border-gray-alpha-400 bg-background-100 font-semibold text-3xl text-gray-1000"
  >
    {title.slice(0, 1)}
  </span>
);

/** Cloudflare mark (no static asset; ported from the legacy docs app). */
const CloudflareIcon = ({ size = 78 }: { size?: number }) => (
  <svg
    aria-hidden
    height={size}
    viewBox="0 0 32 32"
    width={size}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M22.012 22.222c.197-.675.122-1.294-.206-1.754-.3-.422-.807-.666-1.416-.694l-11.545-.15c-.075 0-.14-.038-.178-.094s-.047-.13-.028-.206c.038-.113.15-.197.272-.206l11.648-.15c1.38-.066 2.88-1.182 3.404-2.55l.666-1.735a.38.38 0 0 0 .02-.225c-.75-3.395-3.78-5.927-7.4-5.927-3.34 0-6.17 2.157-7.184 5.15-.657-.488-1.5-.75-2.392-.666-1.604.16-2.9 1.444-3.048 3.048a3.58 3.58 0 0 0 .084 1.191A4.84 4.84 0 0 0 0 22.1c0 .234.02.47.047.703.02.113.113.197.225.197H21.58a.29.29 0 0 0 .272-.206l.16-.572z"
      fill="#f38020"
    />
    <path
      d="M25.688 14.803l-.32.01c-.075 0-.14.056-.17.13l-.45 1.566c-.197.675-.122 1.294.206 1.754.3.422.807.666 1.416.694l2.457.15c.075 0 .14.038.178.094s.047.14.028.206c-.038.113-.15.197-.272.206l-2.56.15c-1.388.066-2.88 1.182-3.404 2.55l-.188.478c-.038.094.028.188.13.188h8.797a.23.23 0 0 0 .225-.169A6.41 6.41 0 0 0 32 21.106a6.32 6.32 0 0 0-6.312-6.302"
      fill="#faae40"
    />
  </svg>
);

const ModelLogoImage = ({
  logo,
  title,
}: {
  logo: ModelLogo;
  title: string;
}) => (
  // Static brand SVGs skip the Next image optimizer deliberately.
  // eslint-disable-next-line @next/next/no-img-element
  <img
    alt={`${title} logo`}
    className={logo.invert ? 'dark:invert' : undefined}
    height={78}
    src={logo.src}
    width={78}
  />
);

export const ModelCard = ({
  color,
  features,
  href,
  logo,
  logoIcon: LogoIcon,
  title,
}: ModelCardData) => (
  <Link
    className="relative flex h-full flex-col overflow-hidden rounded-lg border border-gray-alpha-400 p-5 transition-colors hover:border-gray-alpha-600 focus-visible:ring-2 focus-visible:ring-blue-700"
    href={href}
  >
    <svg
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 size-full"
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
    >
      <defs>
        <radialGradient id={`glow-${color}`}>
          <stop offset="0%" stopColor={`#${color}19`} />
          <stop offset="100%" stopColor={`#${color}00`} />
        </radialGradient>
      </defs>
      <ellipse
        cx="50%"
        cy="0%"
        fill={`url(#glow-${color})`}
        rx="54%"
        ry="20%"
      />
    </svg>
    <h3 className="font-semibold text-gray-1000 text-lg">{title}</h3>
    <div className="flex min-h-36 flex-1 items-center justify-center py-4">
      {LogoIcon ? (
        <LogoIcon size={78} />
      ) : logo ? (
        <ModelLogoImage logo={logo} title={title} />
      ) : (
        <Monogram title={title} />
      )}
    </div>
    <FeatureBadges features={features} />
  </Link>
);

/** Mirrors production ai-sdk.dev's official provider cards. */
const OFFICIAL_MODELS: ModelCardData[] = [
  {
    title: 'Vercel AI Gateway',
    logo: { src: '/images/icons/vercel.svg', invert: true },
    href: '/providers/ai-sdk-providers/ai-gateway',
    color: '000000',
    features: {
      imageGeneration: true,
      image: true,
      object: true,
      tool: true,
      stream: true,
    },
  },
  {
    title: 'OpenAI',
    logo: { src: '/images/icons/openai.svg', invert: true },
    href: '/providers/ai-sdk-providers/openai',
    color: '00aaff',
    features: {
      imageGeneration: true,
      image: true,
      object: true,
      tool: true,
      stream: true,
    },
  },
  {
    title: 'Anthropic',
    logo: { src: '/images/icons/anthropic.svg', invert: true },
    href: '/providers/ai-sdk-providers/anthropic',
    color: '000000',
    features: { image: true, object: true, tool: true, stream: true },
  },
  {
    title: 'Google Generative AI',
    logo: { src: '/images/icons/google.svg' },
    href: '/providers/ai-sdk-providers/google',
    versionedHrefs: {
      '/v5': '/providers/ai-sdk-providers/google-generative-ai',
      '/v6': '/providers/ai-sdk-providers/google-generative-ai',
    },
    color: '00ff33',
    features: { image: true, object: true, tool: true, stream: true },
  },
  {
    title: 'xAI Grok',
    logo: { src: '/images/icons/xai-black.svg', invert: true },
    href: '/providers/ai-sdk-providers/xai',
    color: '2a3275',
    features: {
      image: true,
      imageGeneration: true,
      object: true,
      tool: true,
      stream: true,
    },
  },
  {
    title: 'Azure',
    logo: { src: '/images/icons/azure.svg' },
    href: '/providers/ai-sdk-providers/azure',
    color: '0089D6',
    features: { image: true, object: true, tool: true, stream: true },
  },
  {
    title: 'Amazon Bedrock',
    logo: { src: '/images/icons/aws.svg' },
    href: '/providers/ai-sdk-providers/amazon-bedrock',
    color: 'FF9900',
    features: {
      image: true,
      imageGeneration: true,
      object: true,
      tool: true,
      stream: true,
    },
  },
  {
    title: 'Groq',
    logo: { src: '/images/icons/groq.svg' },
    href: '/providers/ai-sdk-providers/groq',
    color: '000000',
    features: { image: true, object: true, tool: true, stream: true },
  },
  {
    title: 'Fal AI',
    logo: { src: '/images/icons/fal.svg', invert: true },
    href: '/providers/ai-sdk-providers/fal',
    color: 'ed0548',
    features: { imageGeneration: true },
  },
  {
    title: 'DeepInfra',
    logo: { src: '/images/icons/deepinfra.svg' },
    href: '/providers/ai-sdk-providers/deepinfra',
    color: '2a3275',
    features: { image: true, object: true, tool: true, stream: true },
  },
  {
    title: 'Google Vertex AI',
    logo: { src: '/images/icons/google.svg' },
    href: '/providers/ai-sdk-providers/google-vertex',
    color: '00ff33',
    features: {
      imageGeneration: true,
      image: true,
      object: true,
      tool: true,
      stream: true,
    },
  },
  {
    title: 'Mistral',
    logo: { src: '/images/icons/mistral.svg' },
    href: '/providers/ai-sdk-providers/mistral',
    color: 'ff6600',
    features: { image: true, object: true, tool: true, stream: true },
  },
  {
    title: 'Together.ai',
    logo: { src: '/images/icons/togetherai.svg' },
    href: '/providers/ai-sdk-providers/togetherai',
    color: '0f6fff',
    features: { object: true, tool: true, stream: true },
  },
  {
    title: 'Cohere',
    logo: { src: '/images/icons/cohere.svg' },
    href: '/providers/ai-sdk-providers/cohere',
    color: '355146',
    features: { tool: true, stream: true },
  },
  {
    title: 'Fireworks',
    logo: { src: '/images/icons/fireworks.svg', invert: true },
    href: '/providers/ai-sdk-providers/fireworks',
    color: '5019c5',
    features: { imageGeneration: true, object: true, tool: true, stream: true },
  },
  {
    title: 'DeepSeek',
    logo: { src: '/images/icons/deepseek.svg' },
    href: '/providers/ai-sdk-providers/deepseek',
    color: '4f6bff',
    features: { object: true, tool: true, stream: true },
  },
  {
    title: 'Cerebras',
    logo: { src: '/images/icons/cerebras.svg' },
    href: '/providers/ai-sdk-providers/cerebras',
    color: 'f05929',
    features: { object: true, tool: true, stream: true },
  },
  {
    title: 'Perplexity',
    logo: { src: '/images/icons/perplexity.svg' },
    href: '/providers/ai-sdk-providers/perplexity',
    color: '20808D',
    features: {},
  },
  {
    title: 'Luma AI',
    logo: { src: '/images/icons/luma.png' },
    href: '/providers/ai-sdk-providers/luma',
    color: '004dff',
    features: { imageGeneration: true },
  },
  {
    title: 'Baseten',
    logo: { src: '/images/icons/baseten.svg' },
    href: '/providers/ai-sdk-providers/baseten',
    color: '16D767',
    features: { object: true, tool: true, stream: true },
  },
];

const COMMUNITY_MODELS: ModelCardData[] = [
  {
    title: 'Ollama',
    logo: { src: '/images/icons/ollama.png', invert: true },
    href: '/providers/community-providers/ollama',
    color: '020210',
    features: {},
  },
  {
    title: 'Anthropic Vertex',
    logo: { src: '/images/icons/anthropic.svg', invert: true },
    href: '/providers/community-providers/anthropic-vertex-ai',
    color: 'F3801F',
    features: {},
  },
  {
    title: 'Portkey',
    logo: { src: '/images/icons/portkey.png' },
    href: '/providers/community-providers/portkey',
    color: 'F3801F',
    features: {},
  },
  {
    title: 'Cloudflare Workers AI',
    href: '/providers/community-providers/cloudflare-workers-ai',
    color: 'F3801F',
    features: {},
    logoIcon: CloudflareIcon,
  },
  {
    title: 'Write your own',
    logo: { src: '/images/icons/custom.svg', invert: true },
    href: '/providers/community-providers/custom-providers',
    color: '000000',
    features: {},
  },
];

const CardGrid = ({
  models,
  resolveHref = href => href,
  versionPrefix = '',
}: {
  models: ModelCardData[];
  resolveHref?: ResolveHref;
  versionPrefix?: string;
}) => (
  <div className="not-prose grid w-full grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,_minmax(300px,1fr))]">
    {models.map(model => {
      const href = model.versionedHrefs?.[versionPrefix] ?? model.href;
      return (
        <ModelCard {...model} href={resolveHref(href)} key={model.title} />
      );
    })}
  </div>
);

export const OfficialModelCards = ({
  resolveHref,
  versionPrefix,
}: {
  resolveHref?: ResolveHref;
  versionPrefix?: string;
}) => (
  <CardGrid
    models={OFFICIAL_MODELS}
    resolveHref={resolveHref}
    versionPrefix={versionPrefix}
  />
);

export const CommunityModelCards = ({
  resolveHref,
  versionPrefix,
}: {
  resolveHref?: ResolveHref;
  versionPrefix?: string;
}) => (
  <CardGrid
    models={COMMUNITY_MODELS}
    resolveHref={resolveHref}
    versionPrefix={versionPrefix}
  />
);
