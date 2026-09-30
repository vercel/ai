'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@vercel/geistdocs/utils';
import { useRef, useState } from 'react';
import {
  HERO_EXAMPLES,
  PROVIDERS,
  providersFor,
  resolveProvider,
  type Mode,
  type Provider,
} from '@/lib/home/code-examples';
import { CodeWindow } from './code-window';
import { DemoTabs } from './demo-tabs';
import { PreviewPanel } from './preview-panel';

export function HeroInteractive({ className }: { className?: string }) {
  const [active, setActive] = useState(0);
  const [provider, setProvider] = useState<Provider>('grok');
  const [mode, setMode] = useState<Mode>('gateway');
  const panel = useRef<HTMLDivElement>(null);
  const example = HERO_EXAMPLES[active];
  const selected = resolveProvider(example.kind, mode, provider);
  const allowed = providersFor(example.kind, mode);
  const logo = PROVIDERS.find(item => item.id === selected)!;

  const reveal = () => {
    const element = panel.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    if (rect.top < 80 || rect.bottom > window.innerHeight - 24) {
      element.scrollIntoView({
        block: 'center',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
      });
    }
  };
  const cycleProvider = (direction: number) => {
    setProvider(
      allowed[
        (allowed.indexOf(selected) + direction + allowed.length) %
          allowed.length
      ],
    );
    reveal();
  };

  return (
    <div className={cn('min-w-0', className)} data-testid="home-hero-demo">
      <DemoTabs
        active={active}
        items={HERO_EXAMPLES.map(item => item.label)}
        label="AI capabilities"
        tabListClassName="justify-center"
        onChange={index => {
          setActive(index);
          reveal();
        }}
      >
        <div className="mb-4 flex items-center justify-center gap-3">
          <button
            aria-label="Previous provider"
            className="rounded p-2 text-gray-900 hover:bg-gray-200 disabled:opacity-40"
            disabled={allowed.length < 2}
            onClick={() => cycleProvider(-1)}
            type="button"
          >
            <ChevronLeft size={16} />
          </button>
          <img
            alt=""
            className={
              'invert' in logo && logo.invert ? 'size-5 dark:invert' : 'size-5'
            }
            height={20}
            src={`/images/icons/${logo.logo}`}
            width={20}
          />
          <select
            aria-label="Model provider"
            className="max-w-40 rounded border border-gray-400 bg-background-100 px-3 py-2 text-sm"
            onChange={event => {
              setProvider(event.target.value as Provider);
              reveal();
            }}
            value={selected}
          >
            {PROVIDERS.filter(item => allowed.includes(item.id)).map(item => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <button
            aria-label="Next provider"
            className="rounded p-2 text-gray-900 hover:bg-gray-200 disabled:opacity-40"
            disabled={allowed.length < 2}
            onClick={() => cycleProvider(1)}
            type="button"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div
          className="grid scroll-mt-20 gap-4 md:grid-cols-[2fr_1fr]"
          ref={panel}
        >
          <CodeWindow
            code={example.getCode(selected, mode)}
            filename={example.filename}
            mode={mode}
            onModeChange={setMode}
          />
          <PreviewPanel key={`${active}-${selected}`} kind={example.kind} />
        </div>
      </DemoTabs>
      <p className="mt-4 text-center text-sm text-gray-900">
        See all{' '}
        <a
          className="font-medium text-gray-1000 underline-offset-4 hover:underline"
          href="https://vercel.com/ai-gateway/models"
        >
          supported LLM models ↗
        </a>
      </p>
    </div>
  );
}
