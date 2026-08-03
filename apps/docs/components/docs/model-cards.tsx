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

type ResolveHref = (href: string) => string;

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

interface ModelCardData {
  color: string;
  features: ModelFeatures;
  href: string;
  title: string;
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

export const ModelCard = ({
  color,
  features,
  href,
  logo,
  title,
}: ModelCardData & { logo?: ReactNode }) => (
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
      <ellipse cx="50%" cy="0%" fill={`url(#glow-${color})`} rx="54%" ry="20%" />
    </svg>
    <h3 className="font-semibold text-gray-1000 text-lg">{title}</h3>
    <div className="flex min-h-36 flex-1 items-center justify-center py-4">
      {logo ?? <Monogram title={title} />}
    </div>
    <FeatureBadges features={features} />
  </Link>
);

/** Mirrors production ai-sdk.dev's official provider cards. */
const OFFICIAL_MODELS: ModelCardData[] = [
  {
    title: 'Vercel AI Gateway',
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
    href: '/providers/ai-sdk-providers/anthropic',
    color: '000000',
    features: { image: true, object: true, tool: true, stream: true },
  },
  {
    title: 'Google Generative AI',
    href: '/providers/ai-sdk-providers/google-generative-ai',
    color: '00ff33',
    features: { image: true, object: true, tool: true, stream: true },
  },
  {
    title: 'xAI Grok',
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
    href: '/providers/ai-sdk-providers/azure',
    color: '0089D6',
    features: { image: true, object: true, tool: true, stream: true },
  },
  {
    title: 'Amazon Bedrock',
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
    href: '/providers/ai-sdk-providers/groq',
    color: '000000',
    features: { image: true, object: true, tool: true, stream: true },
  },
  {
    title: 'Fal AI',
    href: '/providers/ai-sdk-providers/fal',
    color: 'ed0548',
    features: { imageGeneration: true },
  },
  {
    title: 'DeepInfra',
    href: '/providers/ai-sdk-providers/deepinfra',
    color: '2a3275',
    features: { image: true, object: true, tool: true, stream: true },
  },
  {
    title: 'Google Vertex AI',
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
    href: '/providers/ai-sdk-providers/mistral',
    color: 'ff6600',
    features: { image: true, object: true, tool: true, stream: true },
  },
  {
    title: 'Together.ai',
    href: '/providers/ai-sdk-providers/togetherai',
    color: '0f6fff',
    features: { object: true, tool: true, stream: true },
  },
  {
    title: 'Cohere',
    href: '/providers/ai-sdk-providers/cohere',
    color: '355146',
    features: { tool: true, stream: true },
  },
  {
    title: 'Fireworks',
    href: '/providers/ai-sdk-providers/fireworks',
    color: '5019c5',
    features: { imageGeneration: true, object: true, tool: true, stream: true },
  },
  {
    title: 'DeepSeek',
    href: '/providers/ai-sdk-providers/deepseek',
    color: '4f6bff',
    features: { object: true, tool: true, stream: true },
  },
  {
    title: 'Cerebras',
    href: '/providers/ai-sdk-providers/cerebras',
    color: 'f05929',
    features: { object: true, tool: true, stream: true },
  },
  {
    title: 'Perplexity',
    href: '/providers/ai-sdk-providers/perplexity',
    color: '20808D',
    features: {},
  },
  {
    title: 'Luma AI',
    href: '/providers/ai-sdk-providers/luma',
    color: '004dff',
    features: { imageGeneration: true },
  },
  {
    title: 'Baseten',
    href: '/providers/ai-sdk-providers/baseten',
    color: '16D767',
    features: { object: true, tool: true, stream: true },
  },
];

const COMMUNITY_MODELS: ModelCardData[] = [
  {
    title: 'Ollama',
    href: '/providers/community-providers/ollama',
    color: '020210',
    features: {},
  },
  {
    title: 'Anthropic Vertex',
    href: '/providers/community-providers/anthropic-vertex-ai',
    color: 'F3801F',
    features: {},
  },
  {
    title: 'Portkey',
    href: '/providers/community-providers/portkey',
    color: 'F3801F',
    features: {},
  },
  {
    title: 'Cloudflare Workers AI',
    href: '/providers/community-providers/cloudflare-workers-ai',
    color: 'F3801F',
    features: {},
  },
  {
    title: 'Write your own',
    href: '/providers/community-providers/custom-providers',
    color: '000000',
    features: {},
  },
];

const CardGrid = ({
  models,
  resolveHref = href => href,
}: {
  models: ModelCardData[];
  resolveHref?: ResolveHref;
}) => (
  <div className="not-prose grid w-full grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,_minmax(300px,1fr))]">
    {models.map(model => (
      <ModelCard {...model} href={resolveHref(model.href)} key={model.title} />
    ))}
  </div>
);

export const OfficialModelCards = ({
  resolveHref,
}: {
  resolveHref?: ResolveHref;
}) => <CardGrid models={OFFICIAL_MODELS} resolveHref={resolveHref} />;

export const CommunityModelCards = ({
  resolveHref,
}: {
  resolveHref?: ResolveHref;
}) => <CardGrid models={COMMUNITY_MODELS} resolveHref={resolveHref} />;
