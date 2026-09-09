import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';
import { createCursorACP } from './_create';

run(async () => {
  const events: string[] = [];
  const expectedEvents = [
    'onStart',
    'onStepStart',
    'onLanguageModelCallStart',
    'onLanguageModelCallEnd',
    'onToolExecutionStart',
    'onToolExecutionEnd',
    'onStepEnd',
    'onEnd',
  ];
  const weather = tool({
    description: 'Get the current temperature for a city.',
    inputSchema: z.object({ city: z.string() }),
    execute: async ({ city }: { city: string }) => ({
      city,
      celsius: 12,
    }),
  });
  const agent = new HarnessAgent({
    harness: createCursorACP(),
    sandbox: createVercelSandbox({
      runtime: 'node24',
      ports: [4000],
      timeout: 10 * 60 * 1000,
    }),
    tools: { weather },
    onStart: () => {
      events.push('onStart');
    },
    onStepStart: () => {
      events.push('onStepStart');
    },
    onLanguageModelCallStart: () => {
      events.push('onLanguageModelCallStart');
    },
    onLanguageModelCallEnd: () => {
      events.push('onLanguageModelCallEnd');
    },
    onToolExecutionStart: () => {
      events.push('onToolExecutionStart');
    },
    onToolExecutionEnd: () => {
      events.push('onToolExecutionEnd');
    },
    onStepEnd: () => {
      events.push('onStepEnd');
    },
    onEnd: () => {
      events.push('onEnd');
    },
  });

  const session = await agent.createSession();
  try {
    const result = await agent.generate({
      session,
      prompt:
        'Use the weather tool to get the weather in Paris, then answer in one sentence.',
    });
    const missingEvents = expectedEvents.filter(
      event => !events.includes(event),
    );
    if (missingEvents.length > 0) {
      throw new Error(
        `Lifecycle callbacks not called: ${missingEvents.join(', ')}`,
      );
    }
    console.log(result.text);
    console.log(events);
  } finally {
    await session.destroy();
  }
});
