'use client';

import { type ReactNode, useState } from 'react';
import Image from 'next/image';
import { IconChevronDownSmall } from '@vercel/geistdocs/assets/icons/icon-chevron-down-small';
import {
  CodeBlockTab,
  CodeBlockTabs,
  CodeBlockTabsList,
  CodeBlockTabsTrigger,
} from '@vercel/geistdocs/components/code-block-tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@vercel/geistdocs/components/dropdown-menu';

const providers = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'anthropic', name: 'Anthropic' },
  { id: 'google', name: 'Google' },
];

/** Input and output fences stay in MDX for Markdown exports and search. */
export function ModelCapabilitiesPreview({
  children,
}: {
  children: ReactNode;
}) {
  const [providerIndex, setProviderIndex] = useState(0);
  const provider = providers[providerIndex];
  const examples = (Array.isArray(children) ? children : [children]).filter(
    child => typeof child !== 'string',
  );

  return (
    <CodeBlockTabs
      className="my-8 overflow-hidden rounded-lg border border-gray-alpha-400 bg-background-100"
      defaultValue="input"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 border-gray-alpha-400 border-b px-4">
        <CodeBlockTabsList
          aria-label="Capability example"
          className="mb-0 w-auto overflow-visible pb-0"
        >
          {['Input', 'Output'].map(view => (
            <CodeBlockTabsTrigger
              className="h-12 rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-gray-1000 data-[state=active]:bg-transparent"
              key={view}
              value={view.toLowerCase()}
            >
              {view}
            </CodeBlockTabsTrigger>
          ))}
        </CodeBlockTabsList>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={`Select provider (${provider.name})`}
              className="my-2.5 flex h-8 min-w-36 items-center justify-between gap-3 rounded-md border border-gray-alpha-400 bg-background-100 px-2.5 text-gray-1000 text-xs hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
              type="button"
            >
              <span className="flex items-center gap-2">
                <Image
                  alt=""
                  className="rounded-full"
                  height={16}
                  src={`/images/icons/gateway/${provider.id}.png`}
                  unoptimized
                  width={16}
                />
                {provider.name}
              </span>
              <IconChevronDownSmall size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {providers.map((option, index) => (
              <DropdownMenuItem
                className={index === providerIndex ? 'bg-gray-100' : undefined}
                key={option.id}
                onSelect={() => setProviderIndex(index)}
              >
                <Image
                  alt=""
                  className="mr-2 rounded-full"
                  height={16}
                  src={`/images/icons/gateway/${option.id}.png`}
                  unoptimized
                  width={16}
                />
                {option.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {['input', 'output'].map((view, index) => (
        <CodeBlockTab
          className="max-h-[28rem] min-h-36 overflow-auto [&_[data-focusable-code-region]>div]:m-0 [&_[data-focusable-code-region]>div]:rounded-none [&_[data-focusable-code-region]>div]:border-0"
          key={view}
          value={view}
        >
          {examples[providerIndex * 2 + index]}
        </CodeBlockTab>
      ))}
    </CodeBlockTabs>
  );
}
