'use client';

import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Book } from './book';

const GUIDES = [
  {
    title: 'Build a RAG Agent',
    background: '#2B4570',
    foreground: '#ffffff',
    path: '/resources/recipes/guides/rag-chatbot',
  },
  {
    title: 'Build a SQL Agent',
    background: '#2A3D45',
    foreground: '#ffffff',
    path: '/resources/recipes/guides/natural-language-postgres',
  },
  {
    title: 'Build a Computer Use Agent',
    background: '#8B585F',
    foreground: '#ffffff',
    path: '/resources/recipes/guides/computer-use',
  },
  {
    title: 'Build a Slackbot Agent',
    background: '#E49273',
    foreground: '#000000',
    path: '/resources/recipes/guides/slackbot',
  },
  {
    title: 'Get Started with Gemini',
    background: '#A8D0DB',
    foreground: '#000000',
    path: '/resources/recipes/guides/gemini',
  },
  {
    title: 'Get Started with OpenAI',
    background: '#7E8287',
    foreground: '#ffffff',
    path: '/resources/recipes/guides/openai-responses',
  },
  {
    title: 'Get Started with Anthropic',
    background: '#D4A574',
    foreground: '#2C1810',
    path: '/resources/recipes/guides/claude-4',
  },
];

/** Collapsed visibility per grid slot: 2 on mobile, 3 on sm, 4 on md+. */
const collapsedClass = (index: number) => {
  if (index < 2) {
    return 'flex';
  }
  if (index === 2) {
    return 'hidden sm:flex';
  }
  if (index === 3) {
    return 'hidden md:flex';
  }
  return 'hidden';
};

/**
 * Featured guide book covers on the /resources/recipes landing page
 * (ported from the legacy ai-sdk.dev app).
 */
export const Guides = ({ versionPrefix = '' }: { versionPrefix?: string }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="flex w-full flex-col">
      <div className="grid grid-cols-2 justify-items-center gap-6 py-4 sm:grid-cols-3 md:grid-cols-4">
        {GUIDES.map((guide, index) => (
          <Link
            className={`w-full justify-center ${
              isExpanded ? 'flex' : collapsedClass(index)
            }`}
            href={`${versionPrefix}${guide.path}`}
            key={guide.path}
          >
            <Book
              color={guide.background}
              textColor={guide.foreground}
              title={guide.title}
              width={150}
            />
          </Link>
        ))}
      </div>

      <div className="relative flex items-center justify-center py-2">
        <div className="absolute inset-x-0 h-px bg-gray-alpha-400" />
        <button
          className="relative inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-gray-alpha-400 bg-background-100 px-4 py-2 text-gray-1000 text-sm hover:bg-gray-100"
          onClick={() => setIsExpanded(value => !value)}
          type="button"
        >
          {isExpanded ? 'Show Less' : 'Show More'}
          <ChevronDown
            className={`size-4 text-gray-900 transition-transform ${
              isExpanded ? 'rotate-180' : ''
            }`}
          />
        </button>
      </div>
    </div>
  );
};
