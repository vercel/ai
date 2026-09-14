import { anthropic } from '@ai-sdk/anthropic';
import { generateText, type ModelMessage } from 'ai';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const originalMessage: ModelMessage = {
    role: 'user',
    content:
      'Analyze whether adding an optional response field is backwards compatible.',
  };

  const firstTurn = await generateText({
    model: anthropic('claude-fable-5-1'),
    messages: [originalMessage],
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
});
