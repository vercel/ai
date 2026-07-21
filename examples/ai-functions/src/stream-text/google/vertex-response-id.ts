import { googleVertex } from '@ai-sdk/google-vertex';
import { streamText } from 'ai';
import { run } from '../../lib/run';

/**
 * Vertex variant of ./response-id.ts. google-vertex reuses GoogleLanguageModel,
 * so the same stream fix applies: the provider emits a `response-metadata` chunk
 * carrying Gemini's `responseId`, so `result.response.id` is the real provider
 * response id on the stream path (previously an SDK-generated fallback).
 */
run(async () => {
  const result = streamText({
    model: googleVertex('gemini-2.5-flash'),
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
  console.log('=== provider response id on the stream path (vertex) ===');
  console.log('result.response.id       :', response.id);
  console.log('responseId in raw chunks :', rawId);
  console.log(
    'match                    :',
    response.id === rawId ? 'YES ✅' : 'NO ❌',
  );
});
