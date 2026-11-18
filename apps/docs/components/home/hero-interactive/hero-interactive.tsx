'use client';

import { cn } from '@vercel/geistdocs/utils';
import { IconArrowUpRightSmall } from '@vercel/geistdocs/assets/icons/icon-arrow-up-right-small';
import { useState } from 'react';
import {
  HERO_EXAMPLES,
  providersFor,
  resolveProvider,
  type Mode,
  type Provider,
} from '@/lib/home/code-examples';
import { CodeWindow } from '../code-window';
import { CapabilityTabs } from './capability-tabs';
import { LlmProviderSelector } from './llm-provider-selector';
import { LlmProviderTabs } from './llm-provider-tabs';
import { PreviewPanel } from './preview-panel';
import { useRevealIntoView } from './use-reveal-into-view';

export function HeroInteractive({ className }: { className?: string }) {
  const [provider, setProvider] = useState<Provider>('grok');
  const [activeTab, setActiveTab] = useState(0);
  const [mode, setMode] = useState<Mode>('gateway');
  const { ref: codeRef, reveal } = useRevealIntoView<HTMLDivElement>();

  const example = HERO_EXAMPLES[activeTab];
  const allowedProviders = providersFor(example.kind, mode);
  const selectedProvider = resolveProvider(example.kind, mode, provider);

  const selectProvider = (next: Provider) => {
    setProvider(next);
    reveal();
  };

  return (
    <div
      className={cn('mx-auto flex max-w-4xl flex-col gap-4', className)}
      data-testid="home-hero-demo"
    >
      <div className="mx-auto flex w-fit items-center justify-center gap-8">
        <CapabilityTabs
          activeTab={activeTab}
          onTabChange={index => {
            setActiveTab(index);
            reveal();
          }}
        />
        <LlmProviderSelector
          allowedProviders={allowedProviders}
          className="max-md:hidden"
          onSelect={selectProvider}
          selectedProvider={selectedProvider}
        />
      </div>

      <div className="gap-4 md:grid md:grid-cols-[2fr_1fr]" ref={codeRef}>
        <CodeWindow
          code={example.getCode(selectedProvider, mode)}
          filename={example.filename}
          mode={mode}
          onModeChange={setMode}
        />
        <PreviewPanel
          className="max-md:hidden"
          kind={example.kind}
          selectedProvider={selectedProvider}
        />
      </div>

      <LlmProviderTabs
        allowedProviders={allowedProviders}
        className="md:hidden"
        onSelect={selectProvider}
        selectedProvider={selectedProvider}
      />
      <p className="mx-auto text-copy-14 text-gray-900">
        See all{' '}
        <a
          className="inline-flex items-center font-medium text-gray-1000 hover:underline hover:underline-offset-4"
          href="https://vercel.com/ai-gateway/models"
          rel="noopener noreferrer"
          target="_blank"
        >
          supported LLM models
          <IconArrowUpRightSmall aria-hidden="true" />
        </a>
      </p>
    </div>
  );
}
