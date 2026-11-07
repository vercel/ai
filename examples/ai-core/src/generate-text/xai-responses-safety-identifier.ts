import { xai, type XaiResponsesProviderOptions } from '@ai-sdk/xai';
import { generateText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: xai.responses('grok-4.7'),
    providerOptions: {
      xai: {
        safetyIdentifier: 'ai-core-example-user',
      } satisfies XaiResponsesProviderOptions,
    },
    prompt: 'What is the capital of France?',
  });

  console.log('Text:', result.text);
  // xAI may return the echoed value as null; it is omitted then.
  console.log(
    'Echoed safety identifier:',
    result.providerMetadata?.xai?.safetyIdentifier,
  );
});
