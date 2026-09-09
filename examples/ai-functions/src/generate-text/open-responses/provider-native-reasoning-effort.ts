import {
  createOpenResponses,
  type OpenResponsesLanguageModelOptions,
} from '@ai-sdk/open-responses';
import assert from 'node:assert/strict';
import { generateText } from 'ai';
import { run } from '../../lib/run';

const openResponses = createOpenResponses({
  name: 'deepseek',
  url: 'https://example.com/v1/responses',
  apiKey: 'not-used',
  fetch: async (_url, options) => {
    const requestBody = (await new Response(
      options?.body as BodyInit,
    ).json()) as {
      reasoning?: {
        effort?: string;
        summary?: string;
      };
    };

    assert.deepEqual(requestBody.reasoning, {
      effort: 'max',
      summary: 'detailed',
    });

    return new Response(
      JSON.stringify({
        id: 'response-id',
        status: 'completed',
        output: [
          {
            id: 'message-id',
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [
              {
                type: 'output_text',
                text: 'Provider-native reasoning effort was forwarded.',
                annotations: [],
                logprobs: [],
              },
            ],
          },
        ],
        usage: {
          input_tokens: 1,
          output_tokens: 1,
          total_tokens: 2,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens_details: { reasoning_tokens: 1 },
        },
      }),
      {
        headers: { 'content-type': 'application/json' },
        status: 200,
      },
    );
  },
});

run(async () => {
  const { text } = await generateText({
    model: openResponses('deepseek-v4-flash'),
    prompt: 'Explain why the sky appears blue.',
    reasoning: 'low',
    providerOptions: {
      deepseek: {
        reasoningEffort: 'max',
        reasoningSummary: 'detailed',
      } satisfies OpenResponsesLanguageModelOptions,
    },
  });

  console.log(text);
});
