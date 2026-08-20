import {
  spacexai,
  type SpaceXAILanguageModelResponsesOptions,
} from '@ai-sdk/spacexai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: spacexai.responses('grok-4.5'),
    prompt: 'write one short sentence about san francisco',
    providerOptions: {
      spacexai: {
        logprobs: true,
        topLogprobs: 3,
      } satisfies SpaceXAILanguageModelResponsesOptions,
    },
  });

  console.log(result.text);
  console.log();
  console.log('warnings:', result.warnings);
  console.log('usage:', result.usage);
});
