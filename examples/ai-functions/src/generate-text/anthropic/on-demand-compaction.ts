import {
  anthropic,
  type AnthropicLanguageModelOptions,
} from '@ai-sdk/anthropic';
import { generateText, type ModelMessage } from 'ai';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const history: ModelMessage[] = [
    {
      role: 'user',
      content:
        'I am designing a recipe app. The main entities are Recipe, Ingredient, Step, and RecipeIngredient.',
    },
    {
      role: 'assistant',
      content:
        'RecipeIngredient can connect recipes and ingredients while storing quantity and unit.',
    },
    {
      role: 'user',
      content:
        'Remember that Recipe also needs title, description, and servings.',
    },
  ];

  const summary = await generateText({
    model: anthropic('claude-opus-5'),
    messages: history,
    maxOutputTokens: 4096,
    providerOptions: {
      anthropic: {
        compaction: {
          type: 'summarize',
          instructions: 'Preserve all agreed entities and fields.',
        },
      } satisfies AnthropicLanguageModelOptions,
    },
  });

  if (summary.rawFinishReason !== 'compaction') {
    throw new Error(`Compaction failed: ${summary.rawFinishReason}`);
  }

  const [compactionMessage] = summary.finalStep.response.messages;
  if (compactionMessage?.role !== 'assistant') {
    throw new Error('Anthropic did not return a compaction message.');
  }

  if (!Array.isArray(compactionMessage.content)) {
    throw new Error('Anthropic returned an unexpected compaction message.');
  }

  const compactionPart = compactionMessage.content[0];
  if (
    compactionPart?.type !== 'text' ||
    compactionPart.providerOptions?.anthropic?.signature == null
  ) {
    throw new Error('Anthropic did not return a signed compaction block.');
  }

  print('Compaction summary:', compactionPart.text);
  print('Signature preserved:', true);

  const continuation = await generateText({
    model: anthropic('claude-opus-5'),
    messages: [
      compactionMessage,
      {
        role: 'user',
        content: 'Which Recipe fields should be required?',
      },
    ],
  });

  print('Continuation:', continuation.text);
});
