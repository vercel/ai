import {
  spacexai,
  type SpaceXAILanguageModelResponsesOptions,
} from '@ai-sdk/spacexai';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: spacexai.responses('grok-3-mini-latest'),
    providerOptions: {
      spacexai: {
        reasoningEffort: 'low',
        reasoningSummary: 'detailed',
      } satisfies SpaceXAILanguageModelResponsesOptions,
    },
    prompt: 'What is 12 * 37?',
  });

  let inReasoning = false;
  let inText = false;

  for await (const part of result.stream) {
    if (part.type === 'reasoning-delta') {
      if (!inReasoning) {
        console.log('Reasoning:');
        inReasoning = true;
      }
      process.stdout.write(part.text);
    }
    if (part.type === 'text-delta') {
      if (!inText) {
        if (inReasoning) console.log('\n');
        console.log('Response:');
        inText = true;
      }
      process.stdout.write(part.text);
    }
  }

  console.log('\n');
  console.log(
    'Reasoning tokens:',
    (await result.usage).outputTokenDetails?.reasoningTokens,
  );
  console.log(
    'Text tokens:',
    (await result.usage).outputTokenDetails?.textTokens,
  );
});
