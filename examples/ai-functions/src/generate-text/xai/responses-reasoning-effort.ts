import { xai, type XaiLanguageModelResponsesOptions } from '@ai-sdk/xai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: xai.responses('grok-4.6'),
    prompt: 'How many "r"s are in the word "strawberry"?',
    providerOptions: {
      xai: {
        reasoningEffort: 'xhigh',
      } satisfies XaiLanguageModelResponsesOptions,
    },
  });

  console.log(JSON.stringify(result.content, null, 2));
});
