import { minimax, type MiniMaxLanguageModelOptions } from '@ai-sdk/minimax';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: minimax('minimax-m3'),
    prompt: 'How many "r"s are in the word "strawberry"?',
    providerOptions: {
      minimax: {
        thinking: { type: 'adaptive' },
      } satisfies MiniMaxLanguageModelOptions,
    },
  });

  console.log(result.reasoningText);
  console.log();
  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
});
