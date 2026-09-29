'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CORE_EXAMPLES, type Mode } from '@/lib/home/code-examples';
import { UI_EXAMPLES } from '@/lib/home/ui-examples';
import { CodeWindow } from './code-window';
import { DemoTabs } from './demo-tabs';
import styles from './home.module.css';

export function CodeExamplesSection() {
  const [section, setSection] = useState<'core' | 'ui'>('core');
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<Mode>('gateway');
  const examples = section === 'core' ? CORE_EXAMPLES : UI_EXAMPLES;
  const example = examples[active];

  return (
    <section
      aria-label="Explore the AI SDK"
      className={styles.codeSection}
      data-testid="home-code-examples"
    >
      <div className={`${styles.cell} flex flex-col justify-center gap-10`}>
        {(['core', 'ui'] as const).map(value => (
          <button
            aria-pressed={section === value}
            className="text-left"
            key={value}
            onClick={() => {
              setSection(value);
              setActive(0);
            }}
            type="button"
          >
            <h2
              className={`text-heading-24 ${section === value ? 'text-gray-1000' : 'text-gray-700'}`}
            >
              AI SDK {value === 'core' ? 'Core' : 'UI'}
            </h2>
            <p className="mt-3 text-copy-16 text-gray-900">
              {value === 'core'
                ? 'A unified API for generating text, structured objects, tool calls, and building agents with LLMs.'
                : 'A set of framework-agnostic hooks for quickly building chat and generative user interfaces.'}
            </p>
          </button>
        ))}
        <a
          className="w-fit rounded-full bg-gray-1000 px-5 py-3 text-sm font-medium text-background-100"
          href="https://playground.ai-sdk.dev"
        >
          Go to playground ↗
        </a>
        <Link
          className="text-sm text-gray-900 underline-offset-4 hover:underline"
          href="/providers/ai-sdk-providers"
          prefetch={true}
        >
          Explore supported providers →
        </Link>
      </div>
      <div className={`${styles.cell} min-w-0`}>
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
