// Offline reproduction of #23487: the request must retain language and
// vocabulary hints. The fetch replacement prints the outgoing multipart fields.
import { createOpenAI } from '@ai-sdk/openai';
import { run } from '../lib/run';

run(async () => {
  const provider = createOpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: 'offline-reproduction',
    fetch: async (_url, init) => {
      const body = init?.body as FormData;
      console.log('Sending', {
        languages: body.getAll('languages[]'),
        keywords: body.getAll('keywords[]'),
        prompt: body.get('prompt'),
      });
      return Response.json({ text: 'A spoken recording.' });
    },
  });
  const result = await provider
    .transcription('openai/gpt-transcribe')
    .doGenerate({
      audio: new Uint8Array([1, 2, 3]),
      mediaType: 'audio/mpeg',
      providerOptions: {
        openai: {
          responseFormat: 'json',
          timestampGranularities: [],
          prompt: 'A spoken recording.',
          languages: ['en', 'fr'],
          keywords: ['recording'],
        },
      },
    });
  console.log({ text: result.text, warnings: result.warnings });
});
