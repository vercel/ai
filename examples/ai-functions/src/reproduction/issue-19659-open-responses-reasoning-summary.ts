import { createOpenResponses } from '@ai-sdk/open-responses';
import { streamText } from 'ai';

const expectedReasoning = 'Thinking.';

async function main() {
  const sse = [
    {
      type: 'response.output_item.added',
      output_index: 0,
      item: {
        id: 'rs_1',
        type: 'reasoning',
        summary: [],
      },
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
      text: expectedReasoning,
    },
    {
      type: 'response.output_item.done',
      output_index: 0,
      item: {
        id: 'rs_1',
        type: 'reasoning',
        summary: [{ type: 'summary_text', text: expectedReasoning }],
      },
    },
    {
      type: 'response.completed',
      response: {
        id: 'resp_1',
        usage: {
          input_tokens: 1,
          output_tokens: 1,
        },
      },
    },
  ]
    .map(event => `data: ${JSON.stringify(event)}\n\n`)
    .join('');

  const provider = createOpenResponses({
    name: 'openai',
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

  const eventTypes: string[] = [];
  let streamedReasoning = '';
  let finalReasoningSummary = '';

  for await (const part of result.fullStream) {
    if (part.type === 'reasoning-start') {
      eventTypes.push(part.type);
    } else if (part.type === 'reasoning-delta') {
      eventTypes.push(part.type);
      streamedReasoning += part.text;
    } else if (part.type === 'reasoning-end') {
      eventTypes.push(part.type);
      const metadata = part.providerMetadata?.openai as
        | {
            reasoningSummary?: Array<{ text?: unknown }>;
          }
        | undefined;
      finalReasoningSummary =
        metadata?.reasoningSummary
          ?.map(summary => summary.text)
          .filter((text): text is string => typeof text === 'string')
          .join('') ?? '';
    }
  }

  console.log(
    JSON.stringify(
      {
        eventTypes,
        streamedReasoning,
        finalReasoningSummary,
        expectedReasoning,
      },
      null,
      2,
    ),
  );

  if (
    eventTypes.join(',') === 'reasoning-start,reasoning-end' &&
    streamedReasoning === '' &&
    finalReasoningSummary === expectedReasoning
  ) {
    throw new Error(
      'Issue #19659 reproduced: streamed reasoning was empty while final reasoning summary was "Thinking."',
    );
  }

  if (
    eventTypes[0] !== 'reasoning-start' ||
    eventTypes.at(-1) !== 'reasoning-end' ||
    streamedReasoning !== expectedReasoning ||
    finalReasoningSummary !== expectedReasoning
  ) {
    throw new Error(
      `Unexpected reasoning stream result: events=${eventTypes.join(',')} streamed=${JSON.stringify(streamedReasoning)} final=${JSON.stringify(finalReasoningSummary)}`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
