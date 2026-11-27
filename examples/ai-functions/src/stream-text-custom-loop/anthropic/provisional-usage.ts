import { anthropic } from '@ai-sdk/anthropic';
import { experimental_streamLanguageModelCall as streamLanguageModelCall } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const { stream } = await streamLanguageModelCall({
    model: anthropic('claude-haiku-4-5'),
    prompt: 'Explain how a rainbow forms in three sentences.',
  });

  for await (const part of stream) {
    if (part.type === 'model-call-response-metadata' && part.usage != null) {
      console.log('Provisional usage:', part.usage);
    } else if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    } else if (part.type === 'model-call-end') {
      // Final usage replaces the provisional snapshot. Do not add them together.
      console.log('\nFinal usage:', part.usage);
    } else if (part.type === 'error') {
      throw part.error;
    }
  }
});
