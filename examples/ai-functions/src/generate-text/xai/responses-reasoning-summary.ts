import { xai, type XaiLanguageModelResponsesOptions } from '@ai-sdk/xai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: xai.responses('grok-3-mini-latest'),
    providerOptions: {
      xai: {
        reasoningEffort: 'low',
        reasoningSummary: 'detailed',
      } satisfies XaiLanguageModelResponsesOptions,
    },
    prompt: 'Explain quantum entanglement briefly.',
  });

  console.log(result.text);
  console.log();

  const reasoningParts = result.content.filter(
    part => part.type === 'reasoning',
  );
  if (reasoningParts.length > 0) {
    console.log('Reasoning summary:', reasoningParts[0].text?.slice(0, 200));
  }

  console.log('Usage:', result.usage);
});
