import { mistral, type MistralLanguageModelOptions } from '@ai-sdk/mistral';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: mistral('mistral-small-2603'),
    prompt: 'What is 2 + 2?',
    providerOptions: {
      mistral: {
        reasoningEffort: 'high',
      } satisfies MistralLanguageModelOptions,
    },
  });

  console.log('Reasoning content:');
  if (result.reasoningText) {
    console.log(result.reasoningText);
    console.log();
  }

  console.log('Final answer:');
  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
});
