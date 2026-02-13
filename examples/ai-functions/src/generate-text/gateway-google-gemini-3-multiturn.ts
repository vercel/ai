import type { GoogleLanguageModelOptions } from '@ai-sdk/google';
import { generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';
import { run } from '../lib/run';

const model = 'google/gemini-3-pro-preview';
const firstUserMessage =
  'Use the lookup_definition tool first for "eventual consistency", then answer in one sentence. USE THE GOOGLE PROVIDER!!';

run(async () => {
  const providerOptions = {
    gateway: {
      only: ['google'],
    },
    vertex: {
      safetySettings: [
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_ONLY_HIGH',
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_ONLY_HIGH',
        },
      ],
    } satisfies GoogleLanguageModelOptions,
  };
  const tools = {
    lookup_definition: tool({
      description: 'Returns a short definition for a systems concept.',
      inputSchema: z.object({
        term: z.string(),
      }),
      execute: async ({ term }) => ({
        term,
        definition:
          'Eventual consistency means replicas may temporarily differ, but converge to the same value after propagation.',
      }),
    }),
  };

  const firstTurn = await generateText({
    model,
    prompt: firstUserMessage,
    tools,
    stopWhen: stepCountIs(10),
    providerOptions,
  });

  console.log('Turn 1:', firstTurn.text);
  console.log(
    'Turn 1 provider metadata:',
    JSON.stringify(firstTurn.providerMetadata, null, 2),
  );
  console.log();

  const secondTurn = await generateText({
    model,
    messages: [
      { role: 'user', content: firstUserMessage },
      ...firstTurn.response.messages,
      {
        role: 'user',
        content:
          'Use the lookup_definition tool again, then give a concrete 2-line example involving an inventory update.',
      },
    ],
    tools,
    stopWhen: stepCountIs(10),
    providerOptions,
  });

  console.log('Turn 2:', secondTurn.text);
  console.log(
    'Turn 2 provider metadata:',
    JSON.stringify(secondTurn.providerMetadata, null, 2),
  );
});
