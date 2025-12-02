import { deepseek, DeepSeekChatOptions } from '@ai-sdk/deepseek';
import { streamText } from 'ai';
import { run } from '../lib/run';
import { saveRawChunks } from '../lib/save-raw-chunks';

run(async () => {
  const result = streamText({
    model: deepseek('deepseek-reasoner'),
    prompt: 'How many "r"s are in the word "strawberry"?',
    providerOptions: {
      deepseek: {
        thinking: { type: 'enabled' },
      } satisfies DeepSeekChatOptions,
    },
    includeRawChunks: true,
  });

  await saveRawChunks({ result, filename: 'deepseek-reasoner' });
});
