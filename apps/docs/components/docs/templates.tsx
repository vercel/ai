import {
  Braces,
  ChartLine,
  ChartNoAxesColumn,
  Database,
  File,
  Flag,
  Gauge,
  Image,
  ListOrdered,
  type LucideIcon,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import type { ComponentType } from 'react';
import {
  GoogleIcon,
  NextIcon,
  NuxtIcon,
  OpenAIIcon,
  SolidIcon,
  SvelteIcon,
} from '@/components/docs/template-icons';

type TemplateType =
  | 'generative-ui'
  | 'starter-kits'
  | 'security'
  | 'frameworks'
  | 'feature-exploration';

type TTemplate = {
  title: string;
  description: string;
  logos: (ComponentType<{ size?: number }> | LucideIcon)[];
  type: TemplateType;
  link: string;
};

const TEMPLATES: TTemplate[] = [
  {
    title: 'Gemini Chatbot',
    description: 'Uses Google Gemini, AI SDK, and Next.js.',
    logos: [NextIcon, GoogleIcon],
    type: 'generative-ui',
    link: 'https://vercel.com/templates/next.js/gemini-ai-chatbot',
  },
  {
    title: 'Bot Protection',
    description: 'Uses Kasada, OpenAI GPT-4, AI SDK, and Next.js.',
    logos: [ShieldCheck, NextIcon, OpenAIIcon],
    type: 'security',
    link: 'https://vercel.com/templates/next.js/advanced-ai-bot-protection',
  },
  {
    title: 'Rate Limiting',
    description: 'Uses Vercel KV, OpenAI GPT-4, AI SDK, and Next.js.',
    logos: [Gauge, NextIcon, OpenAIIcon],
    type: 'security',
    link: 'https://github.com/vercel/ai/tree/main/examples/next-openai-upstash-rate-limits',
  },
  {
    title: 'Next.js OpenAI Starter',
    description: 'Uses OpenAI GPT-4, AI SDK, and Next.js.',
    logos: [NextIcon, OpenAIIcon],
    type: 'frameworks',
    link: 'https://github.com/vercel/ai/tree/main/examples/next-openai',
  },
  {
    title: 'Nuxt OpenAI Starter',
    description: 'Uses OpenAI GPT-4, AI SDK, and Nuxt.js.',
    logos: [NuxtIcon, OpenAIIcon],
    type: 'frameworks',
    link: 'https://github.com/vercel/ai/tree/main/examples/nuxt-openai',
  },
  {
    title: 'SvelteKit OpenAI Starter',
    description: 'Uses OpenAI GPT-4, AI SDK, and SvelteKit.',
    logos: [SvelteIcon, OpenAIIcon],
    type: 'frameworks',
    link: 'https://github.com/vercel/ai/tree/main/examples/sveltekit-openai',
  },
  {
    title: 'Solid OpenAI Starter',
    description: 'Uses OpenAI GPT-4, AI SDK, and Solid.',
    logos: [SolidIcon, OpenAIIcon],
    type: 'frameworks',
    link: 'https://github.com/vercel/ai/tree/main/examples/solidstart-openai',
  },
  {
    title: 'Chatbot Starter Template',
    description:
      'Uses the AI SDK and Next.js. Features persistence, multi-modal chat, and more.',
    logos: [NextIcon, Sparkles],
    type: 'starter-kits',
    link: 'https://vercel.com/templates/next.js/nextjs-ai-chatbot',
  },
  {
    title: 'eve Chat',
    description:
      'A persisted AI SDK chat app powered by eve with durable agent sessions, tools, and integrations.',
    logos: [NextIcon, Sparkles],
    type: 'starter-kits',
    link: 'https://vercel.com/templates/eve/eve-chat-template',
  },
  {
    title: 'Internal Knowledge Base (RAG)',
    description:
      'Uses AI SDK Language Model Middleware for RAG and enforcing guardrails.',
    logos: [NextIcon, Database],
    type: 'starter-kits',
    link: 'https://vercel.com/templates/next.js/ai-sdk-internal-knowledge-base',
  },

  {
    title: 'Generative UI with RSC (experimental)',
    description:
      'Uses Next.js, AI SDK, and streamUI to create generative UIs with React Server Components.',
    logos: [NextIcon, OpenAIIcon],
    type: 'generative-ui',
    link: 'https://vercel.com/templates/next.js/rsc-genui',
  },
  {
    title: 'Multi-Modal Chat',
    description:
      'Uses Next.js and AI SDK useChat hook for multi-modal message chat interface.',
    logos: [NextIcon, File],
    type: 'starter-kits',
    link: 'https://vercel.com/templates/next.js/multi-modal-chatbot',
  },
  {
    title: 'Semantic Image Search',
    description:
      'An AI semantic image search app template built with Next.js, AI SDK, and Postgres.',
    logos: [NextIcon, Image],
    type: 'starter-kits',
    link: 'https://vercel.com/templates/next.js/semantic-image-search',
  },
  {
    title: 'Natural Language PostgreSQL',
    description:
      'Query PostgreSQL using natural language with AI SDK and GPT-4o.',
    logos: [NextIcon, ChartLine],
    type: 'starter-kits',
    link: 'https://vercel.com/templates/next.js/natural-language-postgres',
  },
  {
    title: 'Feature Flags Example',
    description:
      'AI SDK with Next.js, Feature Flags, and Edge Config for dynamic model switching.',
    logos: [NextIcon, Flag],
    type: 'feature-exploration',
    link: 'https://vercel.com/templates/next.js/ai-sdk-feature-flags-edge-config',
  },
  {
    title: 'Chatbot with Telemetry',
    description: 'AI SDK chatbot with OpenTelemetry support.',
    logos: [NextIcon, ChartNoAxesColumn],
    type: 'feature-exploration',
    link: 'https://vercel.com/templates/next.js/ai-chatbot-telemetry',
  },
  {
    title: 'Structured Object Streaming',
    description:
      'Uses AI SDK useObject hook to stream structured object generation.',
    logos: [NextIcon, Braces],
    type: 'feature-exploration',
    link: 'https://vercel.com/templates/next.js/use-object',
  },
  {
    title: 'Multi-Step Tools',
    description:
      'Uses AI SDK streamText function to handle multiple tool steps automatically.',
    logos: [NextIcon, ListOrdered],
    type: 'feature-exploration',
    link: 'https://vercel.com/templates/next.js/ai-sdk-roundtrips',
  },
];

export const Templates = ({ type }: { type: TemplateType }) => {
  return (
    <div className="not-prose grid grid-cols-1 gap-4 sm:grid-cols-2">
      {TEMPLATES.filter(template => template.type === type).map(template => (
        <Link
          href={template.link}
          key={template.title}
          rel="noreferrer"
          target="_blank"
        >
          <div className="flex h-full flex-col rounded-lg border border-gray-alpha-400 transition-colors hover:border-gray-alpha-600">
            <div className="flex flex-row items-center justify-center gap-6 rounded-t-lg bg-background-100 p-8 text-gray-1000">
              {template.logos.map((Logo, index) => {
                const isLogo =
                  template.type === 'frameworks' ||
                  template.type === 'generative-ui' ||
                  index === 0;
                // biome-ignore lint/suspicious/noArrayIndexKey: we control the static content
                return <Logo key={index} size={isLogo ? 32 : 24} />;
              })}
            </div>
            <div className="flex-1 rounded-b-lg border-gray-alpha-400 border-t bg-background-200 p-4">
              <div className="font-medium text-gray-1000">{template.title}</div>
              <div className="text-gray-900 text-sm leading-6">
                {template.description}
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
};
