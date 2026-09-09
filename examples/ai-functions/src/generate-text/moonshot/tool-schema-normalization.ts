import { moonshotai } from '@ai-sdk/moonshotai';
import { generateText, isStepCount, jsonSchema, tool } from 'ai';
import { z } from 'zod';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const tupleResult = await generateText({
    model: moonshotai('kimi-k3'),
    tools: {
      weatherAtPoint: tool({
        description: 'Get the weather at a [latitude, longitude] pair',
        inputSchema: z.object({
          // zod tuple, sent as prefixItems
          point: z.tuple([z.number(), z.number()]),
        }),
        execute: async ({ point: [latitude, longitude] }) => ({
          latitude,
          longitude,
          temperature: 72,
        }),
      }),
    },
    stopWhen: isStepCount(2),
    include: { requestBody: true },
    prompt: 'What is the weather at 37.7749, -122.4194?',
  });

  console.log('--- tuple items -> prefixItems ---');
  console.log(tupleResult.text);
  print('Request:', tupleResult.request.body);
  console.log();

  const anyOfResult = await generateText({
    model: moonshotai('kimi-k3'),
    tools: {
      weatherInLocation: tool({
        description:
          'Get the weather in a city by name (3+ characters) or US zip code',
        inputSchema: jsonSchema<{ location: string }>({
          type: 'object',
          properties: {
            // type next to anyOf, sent with type inside the branches
            location: {
              type: 'string',
              anyOf: [{ minLength: 3 }, { pattern: '^\\d{5}$' }],
            },
          },
          required: ['location'],
        }),
        execute: async ({ location }) => ({
          location,
          temperature: 72,
        }),
      }),
    },
    stopWhen: isStepCount(2),
    include: { requestBody: true },
    prompt: 'What is the weather in 94103?',
  });

  console.log('--- type + anyOf -> type inside branches ---');
  console.log(anyOfResult.text);
  print('Request:', anyOfResult.request.body);
});
