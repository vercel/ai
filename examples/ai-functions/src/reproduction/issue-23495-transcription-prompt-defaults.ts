import { createOpenAI } from '@ai-sdk/openai';
import { transcribe } from 'ai';
import { readFile } from 'fs/promises';
import { run } from '../lib/run';

run(async () => {
  const audio = await readFile('data/galileo.mp3');

  const openai = createOpenAI({
    fetch: (async (url, init) => {
      const body = init?.body as FormData;
      console.log('  sending', {
        model: body.get('model'),
        response_format: body.get('response_format'),
        timestamp_granularities: body.getAll('timestamp_granularities[]'),
        prompt: body.get('prompt'),
      });
      return fetch(url, init);
    }) as typeof fetch,
  });

  for (const modelId of ['gpt-transcribe', 'gpt-4o-mini-transcribe']) {
    for (const providerOptions of [
      undefined,
      { openai: { prompt: 'A spoken recording.' } },
    ]) {
      console.log(
        `${modelId} providerOptions=${JSON.stringify(providerOptions)}`,
      );
      try {
        const result = await transcribe({
          model: openai.transcription(modelId),
          audio,
          providerOptions,
        });
        console.log('  ok:', result.text.slice(0, 80));
      } catch (error) {
        console.log('  FAILED:', (error as Error).message);
        console.log(
          '  body:',
          (error as { responseBody?: string }).responseBody,
        );
      }
    }
  }
});
