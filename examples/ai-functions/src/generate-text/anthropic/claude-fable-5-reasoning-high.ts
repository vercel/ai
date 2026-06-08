import {
  anthropic,
  type AnthropicLanguageModelOptions,
} from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: anthropic('claude-fable-5'),
    prompt: 'How many "r"s are in the word "strawberry"?',
    providerOptions: {
      anthropic: {
        thinking: { type: 'adaptive', display: 'summarized' },
        effort: 'high',
      } satisfies AnthropicLanguageModelOptions,
    },
  });

  console.log('Reasoning:');
  console.log(result.reasoning);
  console.log();

  console.log('Text:');
  console.log(result.text);
  console.log();

  console.log('Warnings:', result.warnings);
});
