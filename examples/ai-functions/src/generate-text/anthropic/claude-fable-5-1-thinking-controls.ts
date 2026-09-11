import {
  anthropic,
  type AnthropicLanguageModelOptions,
} from '@ai-sdk/anthropic';
import { generateText, type ModelMessage } from 'ai';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

const thinking = {
  type: 'adaptive',
  display: 'updates',
  blockBinding: {
    prefixMismatchBehavior: 'drop_block',
  },
} satisfies AnthropicLanguageModelOptions['thinking'];

run(async () => {
  const firstTurn = await generateText({
    model: anthropic('claude-fable-5-1'),
    messages: [
      {
        role: 'user',
        content:
          'Analyze whether adding an optional response field is backwards compatible.',
      },
    ],
    providerOptions: { anthropic: { thinking } },
  });

  // Rewriting the first user turn breaks the prefix the thinking block is bound
  // to, so drop_block drops that block and reports the drop back.
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
    providerOptions: { anthropic: { thinking } },
  });

  print('Text:', secondTurn.text);
  print(
    'Input transformations:',
    secondTurn.providerMetadata?.anthropic?.inputTransformations,
  );
});
