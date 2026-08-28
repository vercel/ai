import {
  deepSeek,
  type DeepSeekLanguageModelChatOptions,
} from '@ai-sdk/deepseek';
import { generateText } from 'ai';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: deepSeek('deepseek-v4-flash'),
    prompt: 'Name one practical benefit of request isolation.',
    providerOptions: {
      deepseek: {
        userId: 'example-user_123',
      } satisfies DeepSeekLanguageModelChatOptions,
    },
  });

  print('Response:', result.text);
});
