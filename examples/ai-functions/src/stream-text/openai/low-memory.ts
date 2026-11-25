import { openai } from '@ai-sdk/openai';
import { experimental_streamTextLowMemory } from 'ai';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const result = experimental_streamTextLowMemory({
    model: openai('gpt-5.4-nano'),
    prompt: 'Invent a new holiday and describe its traditions.',
    onError: ({ error }) => {
      console.error(error);
    },
  });

  // Choose one consumer. Write each delta without accumulating the full text.
  for await (const delta of result.textStream) {
    process.stdout.write(delta);
  }
  process.stdout.write('\n');

  // Completion metadata remains available after the stream has been consumed.
  // Final-content getters such as result.text and result.steps are unavailable.
  print('Total usage:', await result.totalUsage);
  print('Finish reason:', await result.finishReason);
});
