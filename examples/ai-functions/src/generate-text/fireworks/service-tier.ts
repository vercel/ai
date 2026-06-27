import {
  fireworks,
  type FireworksLanguageModelOptions,
} from '@ai-sdk/fireworks';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: fireworks('accounts/fireworks/models/glm-5p2'),
    providerOptions: {
      fireworks: {
        serviceTier: 'priority',
      } satisfies FireworksLanguageModelOptions,
    },
    prompt: 'Write a haiku about reliable inference.',
  });

  console.log(result.text);
  console.log();
  console.log('Usage:', result.usage);
});
