import {
  openai,
  type OpenAILanguageModelResponsesOptions,
} from '@ai-sdk/openai';
import { generateText, type ModelMessage } from 'ai';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const model = openai.responses('gpt-6.2-astra');
  const providerOptions = {
    openai: { store: false } satisfies OpenAILanguageModelResponsesOptions,
  };

  const firstTurn = await generateText({
    model,
    reasoning: 'medium',
    prompt:
      'A farmer has 17 rows of 23 trees and removes every third tree. How many remain?',
    providerOptions,
  });

  const changedHistory: ModelMessage[] = [
    {
      role: 'user',
      content:
        'A farmer has 18 rows of 23 trees and removes every third tree. How many remain?',
    },
    ...firstTurn.responseMessages,
    { role: 'user', content: 'Now with 19 rows?' },
  ];

  const secondTurn = await generateText({
    model,
    reasoning: 'medium',
    messages: changedHistory,
    providerOptions,
  });

  print('Text:', secondTurn.text);
  print(
    'Input transformations:',
    secondTurn.providerMetadata?.openai?.inputTransformations,
  );
});
