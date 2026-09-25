import {
  openai,
  type OpenAILanguageModelResponsesOptions,
  type OpenAIResponsesSystemMessageOptions,
} from '@ai-sdk/openai';
import { generateText, type ModelMessage } from 'ai';
import { run } from '../../lib/run';

// Four bounded requests test both update carriers with each supported model.
// Run from examples/ai-functions with the existing OPENAI_API_KEY setup.
run(async () => {
  for (const modelId of ['gpt-6-sol', 'gpt-6-luna'] as const) {
    for (const carrier of ['message', 'request'] as const) {
      const messages: ModelMessage[] =
        carrier === 'message'
          ? [
              { role: 'user', content: 'Say hello.' },
              { role: 'assistant', content: 'Hello.' },
              {
                role: 'system',
                content: '',
                providerOptions: {
                  openai: {
                    reasoningEffortUpdate: 'none',
                  } satisfies OpenAIResponsesSystemMessageOptions,
                },
              },
            ]
          : [];
      messages.push({ role: 'user', content: 'Reply with exactly OK.' });

      const result = await generateText({
        model: openai.responses(modelId),
        reasoning: 'low',
        allowSystemInMessages: true,
        messages,
        providerOptions: {
          openai: {
            reasoningEffortUpdate: carrier === 'request' ? 'none' : undefined,
            reasoningSummary: null,
            store: false,
          } satisfies OpenAILanguageModelResponsesOptions,
        },
        maxOutputTokens: 64,
        maxRetries: 0,
      });

      console.log({
        model: modelId,
        carrier,
        text: result.text,
        finishReason: result.finishReason,
        usage: result.usage,
        warnings: result.warnings,
      });
    }
  }
});
