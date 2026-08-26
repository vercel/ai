import { createOpenResponses } from '@ai-sdk/open-responses';
import { streamText } from 'ai';

async function main() {
  const sse = [
    {
      type: 'response.output_item.added',
      output_index: 0,
      item: { id: 'rs_1', type: 'reasoning', summary: [] },
    },
    {
      type: 'response.reasoning_summary_text.delta',
      item_id: 'rs_1',
      output_index: 0,
      summary_index: 0,
      delta: 'Think',
    },
    {
      type: 'response.reasoning_summary_text.delta',
      item_id: 'rs_1',
      output_index: 0,
      summary_index: 0,
      delta: 'ing.',
    },
    {
      type: 'response.reasoning_summary_text.done',
      item_id: 'rs_1',
      output_index: 0,
      summary_index: 0,
      text: 'Thinking.',
    },
    {
      type: 'response.output_item.done',
      output_index: 0,
      item: {
        id: 'rs_1',
        type: 'reasoning',
        summary: [{ type: 'summary_text', text: 'Thinking.' }],
      },
    },
    {
      type: 'response.completed',
      response: {
        id: 'resp_1',
        status: 'completed',
        incomplete_details: null,
        usage: {
          input_tokens: 1,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens: 1,
          output_tokens_details: { reasoning_tokens: 1 },
          total_tokens: 2,
        },
      },
    },
  ]
    .map(event => `data: ${JSON.stringify(event)}\n\n`)
    .join('');

  const provider = createOpenResponses({
    name: 'reproduction',
    url: 'https://example.invalid/v1/responses',
    apiKey: 'test',
    fetch: async () =>
      new Response(sse, {
        headers: { 'content-type': 'text/event-stream' },
      }),
  });

  const result = streamText({
    model: provider('any-model'),
    prompt: 'hi',
  });

  let streamedReasoning = '';

  for await (const part of result.fullStream) {
    if (part.type === 'reasoning-delta') {
      streamedReasoning += part.text;
    }
  }

  const expectedReasoning = 'Thinking.';

  if (streamedReasoning !== expectedReasoning) {
    throw new Error(
      `ISSUE_19659_REPRODUCED: expected streamed reasoning "${expectedReasoning}" but received "${streamedReasoning}"`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
