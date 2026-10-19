import { minimax, type MiniMaxLanguageModelOptions } from '@ai-sdk/minimax';
import { streamText } from 'ai';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: minimax('MiniMax-M3.1-Flash'),
    maxOutputTokens: 4096,
    prompt: 'How many "r"s are in the word "strawberry"?',
    providerOptions: {
      minimax: { effort: 'high' } satisfies MiniMaxLanguageModelOptions,
    },
  });

  await printFullStream({ result });
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
});
