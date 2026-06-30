import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { run } from '../../lib/run';
import { print } from '../../lib/print';

run(async () => {
  const result = await generateText({
    model: anthropic('claude-sonnet-5'),
    prompt: 'Invent a new holiday and describe its traditions.',
    maxRetries: 0,
    // Claude Sonnet 5 uses adaptive thinking.
    reasoning: 'medium',
  });

  print('Content:', result.content);
  print('Usage:', result.usage);
  print('Finish reason:', result.finishReason);
  print('Raw finish reason:', result.rawFinishReason);

  return result;
});
