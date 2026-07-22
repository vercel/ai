import { createOpenAI } from '@ai-sdk/openai';

async function main() {
  let capturedInput: unknown;

  const openai = createOpenAI({
    apiKey: 'test-api-key',
    fetch: async (_url, init) => {
      if (typeof init?.body !== 'string') {
        throw new Error('Expected a JSON request body');
      }

      capturedInput = (
        JSON.parse(init.body) as {
          input: unknown;
        }
      ).input;

      return new Response(
        JSON.stringify({
          id: 'resp_test',
          model: 'gpt-5.6',
          output: [],
          usage: {
            input_tokens: 0,
            input_tokens_details: { cached_tokens: 0 },
            output_tokens: 0,
            output_tokens_details: { reasoning_tokens: 0 },
          },
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      );
    },
  });

  await openai('gpt-5.6').doGenerate({
    prompt: [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'tsc_hosted_123',
            toolName: 'tool_search',
            input: {
              arguments: { paths: ['get_weather'] },
              call_id: null,
            },
            providerExecuted: true,
            providerMetadata: {
              openai: { itemId: 'tsc_hosted_123' },
            },
          },
          {
            type: 'tool-result',
            toolCallId: 'tsc_hosted_123',
            toolName: 'tool_search',
            output: {
              type: 'json',
              value: {
                tools: [{ name: 'get_weather', type: 'function' }],
              },
            },
            providerMetadata: {
              openai: { itemId: 'tso_hosted_456' },
            },
          },
        ],
      },
    ] as any,
    providerOptions: {
      openai: { store: true },
    },
  });

  const expectedInput = [
    { type: 'item_reference', id: 'tsc_hosted_123' },
    { type: 'item_reference', id: 'tso_hosted_456' },
  ];

  if (JSON.stringify(capturedInput) !== JSON.stringify(expectedInput)) {
    throw new Error(
      `ISSUE #17666 REPRODUCED: expected distinct tool_search item references ${JSON.stringify(
        expectedInput,
      )}, but captured ${JSON.stringify(capturedInput)}`,
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
