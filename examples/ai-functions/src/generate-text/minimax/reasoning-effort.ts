import { minimax, type MiniMaxLanguageModelOptions } from '@ai-sdk/minimax';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const options = {
    // Try 'low', 'medium', 'high', 'xhigh', or 'max'.
    effort: 'xhigh',
  } satisfies MiniMaxLanguageModelOptions;

  const result = await generateText({
    model: minimax('minimax-m3.1-flash'),
    maxOutputTokens: 16384,
    providerOptions: { minimax: options },
    prompt:
      'What is the smallest positive integer divisible by every integer from 1 to 10?',
  });

  console.log('Effort:', options.effort);
  console.log('Reasoning:', result.reasoningText);
  console.log('Answer:', result.text);
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
});
