'use client';

import { Button } from '@vercel/geistdocs/components/button';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { Fragment, useState } from 'react';
import { CORE_EXAMPLES, type Mode } from '@/lib/home/code-examples';
import { UI_EXAMPLES } from '@/lib/home/ui-examples';
import { CodeWindow } from './code-window';
import { DemoTabs } from './demo-tabs';

export function CodeExamplesSection() {
  const [section, setSection] = useState<'core' | 'ui'>('core');
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<Mode>('gateway');
  const examples = section === 'core' ? CORE_EXAMPLES : UI_EXAMPLES;
  const example = examples[active];

  return (
    <section
      aria-label="Explore the AI SDK"
      className="grid grid-cols-1 items-center gap-12 py-12 md:py-20 lg:grid-cols-12 lg:gap-x-12"
      data-testid="home-code-examples"
    >
      <div className="flex flex-col items-start gap-8 lg:col-span-5 lg:max-w-xl">
        {(['core', 'ui'] as const).map((value, index) => (
          <Fragment key={value}>
            {index > 0 ? <hr className="w-full border-gray-alpha-400" /> : null}
            <button
              aria-pressed={section === value}
              className="text-left"
              onClick={() => {
                setSection(value);
                setActive(0);
              }}
              type="button"
            >
              <h2
                className={`text-heading-32 ${section === value ? 'text-gray-1000' : 'text-gray-700'}`}
              >
                AI SDK {value === 'core' ? 'Core' : 'UI'}
              </h2>
              <p
                className={`mt-3 text-copy-18 ${section === value ? 'text-gray-900' : 'text-gray-700'}`}
              >
                {value === 'core'
                  ? 'A unified API for generating text, structured objects, tool calls, and building agents with LLMs.'
                  : 'A set of framework-agnostic hooks for quickly building chat and generative user interfaces.'}
              </p>
            </button>
          </Fragment>
        ))}
        <Button
          className="rounded-full"
          Component="a"
          href="https://playground.ai-sdk.dev"
          size="large"
          suffix={<ArrowUpRight aria-hidden="true" size={16} />}
        >
          Go to playground
        </Button>
        <Link
          className="text-sm text-gray-900 underline-offset-4 hover:underline"
          href="/providers/ai-sdk-providers"
          prefetch={true}
        >
          Explore supported providers →
        </Link>
      </div>
      <div className="min-w-0 lg:col-span-7">
        <DemoTabs
          active={active}
          items={examples.map(item => item.label)}
          label={`${section === 'core' ? 'Core' : 'UI'} examples`}
          onChange={setActive}
        >
          <CodeWindow
            code={example.getCode('openai', mode)}
            filename={example.filename}
            mode={section === 'core' ? mode : undefined}
            onModeChange={setMode}
          />
        </DemoTabs>
      </div>
    </section>
  );
}
