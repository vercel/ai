import { anthropic } from '@ai-sdk/anthropic';
import { generateText, streamText, type ModelMessage } from 'ai';
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

  const secondTurn = streamText({
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

  for await (const textPart of secondTurn.textStream) {
    process.stdout.write(textPart);
  }
  console.log();

  print(
    'Input transformations:',
    (await secondTurn.finalStep).providerMetadata?.anthropic
      ?.inputTransformations,
  );
});
