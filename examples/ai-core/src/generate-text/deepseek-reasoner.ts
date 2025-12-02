import { deepseek, DeepSeekChatOptions } from '@ai-sdk/deepseek';
import { generateText } from 'ai';
import { print } from '../lib/print';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: deepseek('deepseek-reasoner'),
    prompt: 'How many "r"s are in the word "strawberry"?',
    providerOptions: {
      deepseek: {
        thinking: { type: 'enabled' },
      } satisfies DeepSeekChatOptions,
    },
  });

  console.log(JSON.stringify(result.response.body, null, 2));
});
