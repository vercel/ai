import { bedrock, type BedrockProviderOptions } from '@ai-sdk/amazon-bedrock';
import { streamText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = streamText({
    model: bedrock('us.anthropic.claude-opus-4-7'),
    prompt:
      'Solve this step by step: if f(x) = x^3 - 6x^2 + 11x - 6, find all roots and prove they are correct.',
    maxOutputTokens: 55000,
    providerOptions: {
      bedrock: {
        // Without `reasoningConfig.display: 'summarized'` here, this won't include reasoning in the stream,
        // but it may still include a reasoning signature.
        reasoningConfig: {
          type: 'adaptive',
          maxReasoningEffort: 'high',
        },
      } satisfies BedrockProviderOptions,
    },
  });

  for await (const chunk of result.toUIMessageStream({ sendReasoning: true })) {
    console.log(JSON.stringify(chunk));
  }
});
