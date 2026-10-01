import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: openai('gpt-6-luna'),
    prompt: 'Describe a new holiday in one sentence.',
    maxOutputTokens: 128,
    maxRetries: 0,
    providerOptions: { openai: { reasoningEffort: 'none' } },
  });

  console.log(result.text);
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
});
