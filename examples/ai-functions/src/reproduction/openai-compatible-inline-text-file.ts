import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';
import { print } from '../lib/print';
import { run } from '../lib/run';

run(async () => {
  const text = 'Résumé: café, 日本語';
  const provider = createOpenAICompatible({
    name: 'example',
    baseURL: 'https://example.com/v1',
    fetch: async (_url, init) => {
      print('Captured request:', init?.body);
      return Response.json({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Request captured locally.',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0 },
      });
    },
  });

  for (const data of [
    { type: 'data', data: new TextEncoder().encode(text) },
    { type: 'text', text },
  ] as const) {
    print('File encoding:', data.type);
    await generateText({
      model: provider('example-model'),
      maxRetries: 0,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Summarize this document.' },
            { type: 'file', data, mediaType: 'text/plain' },
          ],
        },
      ],
    });
  }
});
