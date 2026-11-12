import {
  openai,
  type OpenAIResponsesSystemMessageOptions,
  type OpenAIToolOptions,
} from '@ai-sdk/openai';
import { generateText, stepCountIs, tool, type ModelMessage } from 'ai';
import { z } from 'zod/v4';
import { run } from '../../lib/run';

run(async () => {
  const model = openai.responses('gpt-5.4');
  const providerOptions = { openai: { store: false } };
  const tools = {
    get_weather: tool({
      description: 'Get the weather for a city.',
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ city }) => ({ city, temperature: 72 }),
      providerOptions: {
        openai: { omitFromRequestTools: true } satisfies OpenAIToolOptions,
      },
    }),
  };

  const messages: ModelMessage[] = [
    { role: 'user', content: 'Hi! I am planning a trip to Rome.' },
  ];
  const first = await generateText({ model, messages, providerOptions });
  console.log(first.text);

  messages.push(
    ...first.response.messages,
    {
      role: 'system',
      content: '',
      providerOptions: {
        openai: {
          additionalTools: [
            {
              type: 'function',
              name: 'get_weather',
              description: 'Get the weather for a city.',
              parameters: {
                type: 'object',
                properties: { city: { type: 'string' } },
                required: ['city'],
                additionalProperties: false,
              },
              strict: true,
            },
          ],
        } satisfies OpenAIResponsesSystemMessageOptions,
      },
    },
    { role: 'user', content: 'What is the weather there right now?' },
  );

  const second = await generateText({
    model,
    tools,
    messages,
    allowSystemInMessages: true,
    stopWhen: stepCountIs(3),
    providerOptions,
  });
  console.log(second.text);
});
