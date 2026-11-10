import {
  google,
  type GoogleLanguageModelInteractionsOptions,
} from '@ai-sdk/google';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: google.interactions('gemini-2.5-flash'),
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

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
});
