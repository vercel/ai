import { openai, OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { run } from '../lib/run';
import { print } from '../lib/print';

run(async () => {
  const result = await generateText({
    model: openai('gpt-5-chat'),
    prompt: 'Invent a new holiday and describe its traditions.',
    providerOptions: {
      openai: {
        store: false,
        include: ['reasoning.encrypted_content'],
      } satisfies OpenAIResponsesProviderOptions,
    },
  });

  print('Content:', result.content);
});
