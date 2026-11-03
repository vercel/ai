import { createCohere } from '@ai-sdk/cohere';
import { generateText } from 'ai';
import { run } from '../lib/run';
import { print } from '../lib/print';

run(async () => {
  const text = 'Résumé: café, 日本語';
  const bytes = Buffer.from(text);
  const base64 = bytes.toString('base64');
  const cohere = createCohere({
    apiKey: 'test-key',
    fetch: async (_url, init) => {
      print('Captured request:', init?.body);
      return Response.json({
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Request captured locally.' }],
        },
        finish_reason: 'COMPLETE',
        usage: { tokens: { input_tokens: 0, output_tokens: 0 } },
      });
    },
  });

  print('Expected document text:', text);

  for (const [encoding, data] of [
    ['bytes', bytes],
    ['base64', base64],
    ['data URL', new URL(`data:text/plain;base64,${base64}`)],
  ] as const) {
    print('File encoding:', encoding);
    await generateText({
      model: cohere('command-a-03-2025'),
      maxRetries: 0,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Summarize this document.' },
            {
              type: 'file',
              data,
              mediaType: 'text/plain',
              filename: 'report.txt',
            },
          ],
        },
      ],
    });
  }
});
