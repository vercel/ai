import { openai } from '@ai-sdk/openai';
import { streamText, type ModelMessage } from 'ai';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

const messages = [
  {
    role: 'user',
    content: [
      {
        type: 'text',
        text: 'Call the get_weather tool for Chicago.',
        providerOptions: {
          openai: {
            additionalTools: [
              {
                type: 'function',
                name: 'get_weather',
                description: 'Get the weather at a location.',
                parameters: {
                  type: 'object',
                  properties: {
                    location: { type: 'string' },
                  },
                  required: ['location'],
                  additionalProperties: false,
                },
              },
            ],
          },
        },
      },
    ],
  },
] satisfies ModelMessage[];

run(async () => {
  const result = streamText({
    model: openai('gpt-5.6-sol'),
    messages,
  });

  await printFullStream({ result });
});
