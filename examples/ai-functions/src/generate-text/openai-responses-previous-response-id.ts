import {
  openai,
  OpenaiResponsesProviderMetadata,
  OpenAIResponsesProviderOptions,
} from '@ai-sdk/openai';
import { generateText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result1 = await generateText({
    model: openai.responses('gpt-4o-mini'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  const providerMetadata = result1.providerMetadata as
    | OpenaiResponsesProviderMetadata
    | undefined;
  if (!providerMetadata) return;

  const {
    openai: { responseId: previousResponseId },
  } = providerMetadata;

  const result2 = await generateText({
    model: openai.responses('gpt-4o-mini'),
    prompt: 'Summarize in 2 sentences',
    providerOptions: {
      openai: {
        previousResponseId,
      } satisfies OpenAIResponsesProviderOptions,
    },
  });

  console.log(result2.text);
});
