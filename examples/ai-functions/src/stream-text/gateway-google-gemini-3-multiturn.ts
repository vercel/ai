import type { GoogleLanguageModelOptions } from '@ai-sdk/google';
import { stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';
import { run } from '../lib/run';

const model = 'google/gemini-3-flash';
const firstUserMessage =
  'Use the lookup_definition tool first for "eventual consistency", then answer in one sentence.';

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

  const firstTurn = streamText({
    model,
    prompt: firstUserMessage,
    tools,
    stopWhen: stepCountIs(10),
    providerOptions,
  });

  let firstTurnText = '';
  process.stdout.write('Turn 1: ');
  for await (const textPart of firstTurn.textStream) {
    firstTurnText += textPart;
    process.stdout.write(textPart);
  }
  process.stdout.write('\n');
  console.log(
    'Turn 1 provider metadata:',
    JSON.stringify(await firstTurn.providerMetadata, null, 2),
  );
  console.log();
  const firstTurnResponse = await firstTurn.response;

  const secondTurn = streamText({
    model,
    messages: [
      { role: 'user', content: firstUserMessage },
      ...firstTurnResponse.messages,
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

  process.stdout.write('Turn 2: ');
  for await (const textPart of secondTurn.textStream) {
    process.stdout.write(textPart);
  }
  process.stdout.write('\n');
  console.log(
    'Turn 2 provider metadata:',
    JSON.stringify(await secondTurn.providerMetadata, null, 2),
  );
});
