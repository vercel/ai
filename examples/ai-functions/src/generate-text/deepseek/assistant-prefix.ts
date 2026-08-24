import {
  createDeepSeek,
  type DeepSeekAssistantMessageProviderOptions,
} from '@ai-sdk/deepseek';
import { generateText } from 'ai';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

const deepSeek = createDeepSeek({
  baseURL: 'https://api.deepseek.com/beta',
});

run(async () => {
  const { text } = await generateText({
    model: deepSeek('deepseek-v4-flash'),
    messages: [
      {
        role: 'user',
        content: 'Write a short sentence about the color of the sky.',
      },
      {
        role: 'assistant',
        content: 'The sky is',
        providerOptions: {
          deepseek: {
            prefix: true,
          } satisfies DeepSeekAssistantMessageProviderOptions,
        },
      },
    ],
  });

  print('Prefix:', 'The sky is');
  print('Continuation:', text);
});
