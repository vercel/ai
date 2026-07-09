import { openai, type OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { run } from '../lib/run';

type ReasoningContextMetadata = {
  responseId?: string;
  reasoningContext?: string;
};

run(async () => {
  const firstResult = await generateText({
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

  const firstMetadata = firstResult.providerMetadata?.openai as
    | ReasoningContextMetadata
    | undefined;
  if (!firstMetadata?.responseId) {
    throw new Error('OpenAI did not return a response ID.');
  }

  console.log('First response:', firstResult.text);
  console.log('Effective reasoning context:', firstMetadata.reasoningContext);

  const secondResult = await generateText({
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

  const secondMetadata = secondResult.providerMetadata?.openai as
    | ReasoningContextMetadata
    | undefined;
  console.log('Second response:', secondResult.text);
  console.log('Effective reasoning context:', secondMetadata?.reasoningContext);
});
