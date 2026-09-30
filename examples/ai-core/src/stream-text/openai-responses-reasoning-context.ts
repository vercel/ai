import { openai, type OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { run } from '../lib/run';

type ReasoningContextMetadata = {
  responseId?: string;
  reasoningContext?: string;
};

run(async () => {
  const firstResult = streamText({
    model: openai.responses('gpt-5.6'),
    prompt:
      'Create a reversible three-step launch plan for a new API without interrupting existing clients.',
    providerOptions: {
      openai: {
        reasoningEffort: 'low',
        reasoningContext: 'all_turns',
      } satisfies OpenAIResponsesProviderOptions,
    },
  });

  for await (const textDelta of firstResult.textStream) {
    process.stdout.write(textDelta);
  }
  console.log();

  const firstMetadata = (await firstResult.providerMetadata)?.openai as
    | ReasoningContextMetadata
    | undefined;
  if (!firstMetadata?.responseId) {
    throw new Error('OpenAI did not return a response ID.');
  }
  console.log('Effective reasoning context:', firstMetadata.reasoningContext);

  const secondResult = streamText({
    model: openai.responses('gpt-5.6'),
    prompt:
      'Revise step two to include a measurable rollback trigger without changing the other steps.',
    providerOptions: {
      openai: {
        previousResponseId: firstMetadata.responseId,
        reasoningEffort: 'low',
        reasoningContext: 'all_turns',
      } satisfies OpenAIResponsesProviderOptions,
    },
  });

  for await (const textDelta of secondResult.textStream) {
    process.stdout.write(textDelta);
  }
  console.log();

  const secondMetadata = (await secondResult.providerMetadata)?.openai as
    | ReasoningContextMetadata
    | undefined;
  console.log('Effective reasoning context:', secondMetadata?.reasoningContext);
});
