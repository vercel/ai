<<<<<<< HEAD:examples/ai-functions/src/generate-text/anthropic/claude-fable-5-1-thinking-controls.ts
import {
  anthropic,
  type AnthropicLanguageModelOptions,
} from '@ai-sdk/anthropic';
import { generateText } from 'ai';
=======
import { anthropic } from '@ai-sdk/anthropic';
import { generateText, type ModelMessage } from 'ai';
import { print } from '../../lib/print';
>>>>>>> e4292e7dec (feat(anthropic): expand preserved thinking support to cover `prefix_mismatch_behavior: 'error'` (#20624)):examples/ai-functions/src/generate-text/anthropic/claude-fable-5-1-thinking-binding.ts
import { run } from '../../lib/run';

run(async () => {
  const originalMessage: ModelMessage = {
    role: 'user',
    content:
      'Analyze whether adding an optional response field is backwards compatible.',
  };

  const firstTurn = await generateText({
    model: anthropic('claude-fable-5-1'),
<<<<<<< HEAD:examples/ai-functions/src/generate-text/anthropic/claude-fable-5-1-thinking-controls.ts
    prompt: 'Compare two approaches to implementing an LRU cache.',
=======
    messages: [originalMessage],
>>>>>>> e4292e7dec (feat(anthropic): expand preserved thinking support to cover `prefix_mismatch_behavior: 'error'` (#20624)):examples/ai-functions/src/generate-text/anthropic/claude-fable-5-1-thinking-binding.ts
    providerOptions: {
      anthropic: {
        thinking: {
          type: 'adaptive',
<<<<<<< HEAD:examples/ai-functions/src/generate-text/anthropic/claude-fable-5-1-thinking-controls.ts
          display: 'updates',
=======
>>>>>>> e4292e7dec (feat(anthropic): expand preserved thinking support to cover `prefix_mismatch_behavior: 'error'` (#20624)):examples/ai-functions/src/generate-text/anthropic/claude-fable-5-1-thinking-binding.ts
          blockBinding: {
            prefixMismatchBehavior: 'drop_block',
          },
        },
      } satisfies AnthropicLanguageModelOptions,
    },
  });

<<<<<<< HEAD:examples/ai-functions/src/generate-text/anthropic/claude-fable-5-1-thinking-controls.ts
  console.log('Reasoning:', result.reasoning);
  console.log('Text:', result.text);
=======
  const changedHistory: ModelMessage[] = [
    {
      role: 'user',
      content:
        'Analyze whether adding a required response field is backwards compatible.',
    },
    ...firstTurn.response.messages,
    {
      role: 'user',
      content: 'Revisit the analysis using the updated requirement.',
    },
  ];

  const secondTurn = await generateText({
    model: anthropic('claude-fable-5-1'),
    messages: changedHistory,
    providerOptions: {
      anthropic: {
        thinking: {
          type: 'adaptive',
          blockBinding: {
            prefixMismatchBehavior: 'drop_block',
          },
        },
      },
    },
  });

  print('Text:', secondTurn.text);
  print(
    'Input transformations:',
    secondTurn.providerMetadata?.anthropic?.inputTransformations,
  );
>>>>>>> e4292e7dec (feat(anthropic): expand preserved thinking support to cover `prefix_mismatch_behavior: 'error'` (#20624)):examples/ai-functions/src/generate-text/anthropic/claude-fable-5-1-thinking-binding.ts
});
