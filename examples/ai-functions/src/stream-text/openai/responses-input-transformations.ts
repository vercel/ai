import {
  openai,
  type OpenAILanguageModelResponsesOptions,
} from '@ai-sdk/openai';
import { streamText, type ModelMessage } from 'ai';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const model = openai.responses('gpt-6.2-astra');
  const providerOptions = {
    openai: { store: false } satisfies OpenAILanguageModelResponsesOptions,
  };

  const firstTurn = streamText({
    model,
    reasoning: 'medium',
    prompt:
      'A farmer has 17 rows of 23 trees and removes every third tree. How many remain?',
    providerOptions,
  });
  await firstTurn.consumeStream();

  const changedHistory: ModelMessage[] = [
    {
      role: 'user',
      content:
        'A farmer has 18 rows of 23 trees and removes every third tree. How many remain?',
    },
    ...(await firstTurn.responseMessages),
    { role: 'user', content: 'Now with 19 rows?' },
  ];

  const secondTurn = streamText({
    model,
    reasoning: 'medium',
    messages: changedHistory,
    providerOptions,
  });

  for await (const textPart of secondTurn.textStream) {
    process.stdout.write(textPart);
  }
  console.log();

  print(
    'Input transformations:',
    (await secondTurn.providerMetadata)?.openai?.inputTransformations,
  );
});
