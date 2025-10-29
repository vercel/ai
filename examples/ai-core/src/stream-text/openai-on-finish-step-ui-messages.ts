// pn

import { openai } from '@ai-sdk/openai';
import { streamText, tool, stepCountIs } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = streamText({
    model: openai('gpt-4.1-mini'),
    // Exactly 3 sequential steps:
    // 1) getNumber -> 2) double -> 3) final sentence
    stopWhen: stepCountIs(3),
    tools: {
      getNumber: tool({
        description: 'Step 1: Return a single integer.',
        inputSchema: z.object({}),
        execute: async () => {
          return { n: 7 }; // keep it simple & deterministic
        },
      }),
      double: tool({
        description: 'Step 2: Double the provided integer from step 1.',
        inputSchema: z.object({ n: z.number() }),
        execute: async ({ n }) => {
          return { original: n, doubled: n * 2 };
        },
      }),
    },
    prompt: `
Follow EXACTLY 3 steps, one at a time, no parallel tool calls:

1) Call "getNumber" (no input).
2) Call "double" using the "n" returned from step 1.
3) Write ONE short sentence mentioning both the original and doubled numbers.

Do not call more than one tool in any single step.
Do not add extra steps.
`,
  });

  const ui = result.toUIMessageStream({
    onStepFinish: async event => {
      console.log(`\n--- Step ${event.stepNumber} ---`);
      console.log('Step message (only this step):');
      for (const part of event.stepMessage.parts) {
        console.log(JSON.stringify(part, null, 2));
      }
    },
    onFinish: async () => {
      console.log('\nDone.');
    },
  });

  for await (const _ of ui) {
    // drain the stream
  }
}

main().catch(console.error);
