import { GoogleLanguageModel } from '@ai-sdk/google/internal';
import { generateText } from 'ai';
import { readFileSync } from 'node:fs';
import { run } from '../lib/run';

// Replay trimmed responses captured from a real Gemini 4 Argon continuation.
const responses = [1, 2].map(index =>
  JSON.parse(
    readFileSync(
      new URL(
        `../../../../packages/google/src/__fixtures__/google-continuation-grounding-${index}.json`,
        import.meta.url,
      ),
      'utf8',
    ),
  ),
);

run(async () => {
  let request = 0;
  const result = await generateText({
    model: new GoogleLanguageModel('gemini-4-argon', {
      provider: 'google',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      generateId: () => crypto.randomUUID(),
      fetch: async () => Response.json(responses[request++]),
    }),
    prompt: 'Replay the captured continuation response.',
    maxOutputTokens: 33_280,
    maxRetries: 0,
  });

  console.log('Requests:', request);
  console.log('Sources:', result.sources.length);
  console.dir(result.finalStep.providerMetadata?.google, { depth: null });
  console.log('Usage:', result.usage);
});
