import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import { run } from '../../lib/run';

/**
 * Demonstrates that the Google provider surfaces the provider response id on the
 * stream path.
 *
 * Gemini returns `responseId` in the response body and repeats it in every
 * streaming chunk. The provider now parses it and emits a `response-metadata`
 * chunk (once, as soon as it appears), so:
 *   - `result.response.id` is the real provider `responseId`, and
 *   - downstream consumers that read the `response-metadata` id (e.g. the AI
 *     Gateway) capture it too.
 *
 * Before the fix `result.response.id` was an SDK-generated `aitxt-…` fallback
 * and no `response-metadata` chunk was emitted. Run with rawChunks on to compare
 * against the raw payload.
 */
run(async () => {
  const result = streamText({
    model: google('gemini-2.5-flash'),
    prompt: 'Reply with only the word: ok',
    include: { rawChunks: true },
  });

  const rawResponseIds = new Set<string>();
  for await (const chunk of result.stream) {
    if (chunk.type === 'raw') {
      const raw = chunk.rawValue as { responseId?: string };
      if (raw?.responseId) rawResponseIds.add(raw.responseId);
    }
  }

  const response = await result.response;
  const rawId = [...rawResponseIds][0];

  console.log();
  console.log('=== provider response id on the stream path ===');
  console.log('result.response.id       :', response.id);
  console.log('responseId in raw chunks :', rawId);
  console.log(
    'match                    :',
    response.id === rawId ? 'YES ✅' : 'NO ❌',
  );
});
