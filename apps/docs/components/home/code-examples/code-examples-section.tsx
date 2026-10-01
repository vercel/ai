'use client';

import { IconArrowUpRightSmall } from '@vercel/geistdocs/assets/icons/icon-arrow-up-right-small';
import { Button } from '@vercel/geistdocs/components/button';
import { cn } from '@vercel/geistdocs/utils';
import { Fragment, useState } from 'react';
import { CORE_EXAMPLES, type Mode } from '@/lib/home/code-examples';
import { UI_EXAMPLES } from '@/lib/home/ui-examples';
import { HighlightedCode } from '../code-window';
import { Select } from '../select';
import { BrowserHeader, BrowserRoot } from './browser-window';
import { CorePreview } from './core-preview';
import { SlidingTabs } from './sliding-tabs';
import { UiPreview } from './ui-preview';

interface Example {
  id: string;
  label: string;
  filename: string;
  previewId: string;
  getCode: (mode: Mode) => string;
}

interface Section {
  id: 'core' | 'ui';
  label: string;
  description: string;
  examples: Example[];
  /** Render the "Use with" gateway/provider/custom selector. */
  hasModes: boolean;
}

const UI_PREVIEW_IDS: Record<string, string> = {
  'chat.tsx': 'use-chat',
  'completion.tsx': 'use-completion',
  'object-generation.tsx': 'use-object',
  'chat-tools.tsx': 'chat-tools',
  'generative-ui.tsx': 'generative-ui',
};

// Only the examples with a live preview: the five capabilities for Core and
// the five hooks for UI.
const SECTIONS: Section[] = [
  {
    id: 'core',
    label: 'AI SDK Core',
    description:
      'A unified API for generating text, structured objects, tool calls, and building agents with LLMs.',
    hasModes: true,
    examples: CORE_EXAMPLES.slice(0, 5).map(example => ({
      id: example.filename,
      label: example.label,
      filename: example.filename,
      previewId: example.kind,
      getCode: mode => example.getCode('openai', mode),
    })),
  },
  {
    id: 'ui',
    label: 'AI SDK UI',
    description:
      'A set of framework-agnostic hooks for quickly building chat and generative user interfaces.',
    hasModes: false,
    examples: UI_EXAMPLES.filter(
      example => UI_PREVIEW_IDS[example.filename],
    ).map(example => ({
      id: example.filename,
      label: example.label,
      filename: example.filename,
      previewId: UI_PREVIEW_IDS[example.filename],
      getCode: mode => example.getCode('openai', mode),
    })),
  },
];

function ViewSwitch({
  view,
  onChange,
}: {
  view: 'code' | 'preview';
  onChange: (view: 'code' | 'preview') => void;
}) {
  // Concentric radii: the window is rounded-[12px] and the switch is inset
  // 8px, so 12 − 8 = 4px; the active pill sits inside 2px of padding, so 2px.
  return (
    <div
      aria-label="View"
      className="flex h-7 items-center rounded-[4px] bg-background-100 p-0.5 shadow-[0_0_0_1px_var(--ds-gray-alpha-400)]"
      role="radiogroup"
    >
      {(['code', 'preview'] as const).map(value => (
        <button
          aria-checked={view === value}
          className={cn(
            'flex h-full items-center rounded-[2px] px-2.5 text-[13px] font-medium capitalize transition-colors',
            view === value
              ? 'bg-gray-100 text-gray-1000'
              : 'text-gray-900 hover:text-gray-1000',
          )}
          key={value}
          onClick={() => onChange(value)}
          role="radio"
          type="button"
        >
          {value}
        </button>
      ))}
    </div>
  );
}

export function CodeExamplesSection() {
  const [sectionId, setSectionId] = useState<Section['id']>('core');
  const section = SECTIONS.find(item => item.id === sectionId) ?? SECTIONS[0];
  const [exampleId, setExampleId] = useState(section.examples[0].id);
  const example =
    section.examples.find(item => item.id === exampleId) ?? section.examples[0];
  const [mode, setMode] = useState<Mode>('gateway');
  const [view, setView] = useState<'code' | 'preview'>('preview');
  const code = example.getCode(mode);
  const showPreview = view === 'preview';

  const selectSection = (id: Section['id']) => {
    setSectionId(id);
    setExampleId(SECTIONS.find(item => item.id === id)?.examples[0].id ?? '');
    setView('preview');
  };

  return (
    <section
      aria-label="Explore the AI SDK"
      className="grid grid-cols-1 gap-10 py-12 md:py-20 lg:grid-cols-12 lg:gap-8"
      data-testid="home-code-examples"
    >
      <div className="flex flex-col gap-10 lg:col-span-4 lg:col-start-1 lg:self-center">
        {SECTIONS.map((item, index) => {
          const active = item.id === section.id;
          return (
            <Fragment key={item.id}>
              {index > 0 ? (
                <div
                  aria-hidden="true"
                  className="h-px w-full bg-[linear-gradient(to_right,var(--ds-gray-200)_0%,var(--ds-gray-200)_90%,transparent_100%)]"
                />
              ) : null}
              <button
                aria-pressed={active}
                className="group text-left"
                onClick={() => selectSection(item.id)}
                type="button"
              >
                <h2
                  className={cn(
                    'text-heading-16 font-medium! transition-colors duration-250 sm:text-heading-24',
                    active
                      ? 'text-gray-1000'
                      : 'text-gray-700 group-hover:text-gray-1000',
                  )}
                >
                  {item.label}
                </h2>
                <p
                  className={cn(
                    'mt-3 text-copy-16 transition-colors duration-250',
                    active
                      ? 'text-gray-900'
                      : 'text-gray-700 group-hover:text-gray-900',
                  )}
                >
                  {item.description}
                </p>
              </button>
            </Fragment>
          );
        })}
        <Button
          className="self-start rounded-full"
          Component="a"
          href="https://playground.ai-sdk.dev"
          rel="noopener noreferrer"
          suffix={<IconArrowUpRightSmall aria-hidden="true" />}
          target="_blank"
        >
          AI Playground
        </Button>
      </div>

      <div className="flex min-w-0 flex-col gap-4 lg:col-span-6 lg:col-start-7">
        <SlidingTabs
          items={section.examples}
          label={`${section.label} examples`}
          onValueChange={setExampleId}
          value={example.id}
        />

        <BrowserRoot className="group">
          {/* The switch overlaps the centered filename on narrow widths, so
              hide the title until there's room. */}
          <BrowserHeader
            className="mb-px [&>h3]:hidden sm:[&>h3]:flex"
            title={example.filename}
          />
          <div className="absolute top-0 right-2 z-20 flex h-(--browser-header-height) items-center">
            <ViewSwitch onChange={setView} view={view} />
          </div>
          {showPreview ? (
            section.id === 'core' ? (
              <CorePreview previewId={example.previewId} />
            ) : (
              <UiPreview previewId={example.previewId} />
            )
          ) : (
            <>
              <HighlightedCode
                className="h-[309px] [&_pre]:min-h-[309px] [&_pre]:px-2 [&_pre]:py-6"
                code={code}
                key={`${example.id}-${mode}`}
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background-100 to-transparent"
              />
              {section.hasModes ? (
                <label className="absolute right-4 bottom-4 z-10 flex items-center gap-2 text-copy-13 text-gray-900">
                  <span className="max-sm:hidden">Use with</span>
                  <Select
                    aria-label="Use with"
                    onChange={event => setMode(event.target.value as Mode)}
                    value={mode}
                  >
                    <option value="gateway">AI Gateway</option>
                    <option value="provider">Provider</option>
                    <option value="custom">Custom provider</option>
                  </Select>
                </label>
              ) : null}
            </>
          )}
        </BrowserRoot>

        <div
          aria-label="Select SDK"
          className="flex items-center justify-center"
          role="tablist"
        >
          {SECTIONS.map((item, index) => {
            const active = item.id === section.id;
            return (
              <button
                aria-label={item.label}
                aria-selected={active}
                className={cn(
                  'flex items-center justify-center p-2',
                  index === SECTIONS.length - 1 && '-ml-1',
                )}
                key={item.id}
                onClick={() => selectSection(item.id)}
                role="tab"
                type="button"
              >
                <span
                  className={cn(
                    'size-2 rounded-full transition-colors',
                    active ? 'bg-gray-900' : 'bg-gray-500',
                  )}
                />
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
