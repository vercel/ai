import {
  google,
  type GoogleLanguageModelInteractionsOptions,
} from '@ai-sdk/google';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: google.interactions('gemini-4-hydrogen'),
    prompt: 'Hello, how are you?',
    providerOptions: {
      google: {
        labels: {
          application: 'example',
          safety_identifier: 'opaque_user_123',
        },
        store: false,
      } satisfies GoogleLanguageModelInteractionsOptions,
    },
  });

  console.log(result.text);
  console.log('Token usage:', result.usage);
});
