import {
  spacexai,
  type SpaceXAILanguageModelResponsesOptions,
} from '@ai-sdk/spacexai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: spacexai.responses('grok-3-mini-latest'),
    providerOptions: {
      spacexai: {
        reasoningEffort: 'low',
        reasoningSummary: 'detailed',
      } satisfies SpaceXAILanguageModelResponsesOptions,
    },
    prompt: 'What is 12 * 37?',
  });

  console.log('Response:', result.text);
  console.log();
  console.log(
    'Reasoning tokens:',
    result.usage.outputTokenDetails?.reasoningTokens,
  );
  console.log('Text tokens:', result.usage.outputTokenDetails?.textTokens);
});
