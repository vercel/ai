import {
  createOpenResponses,
  type Experimental_OpenResponsesBareExtension,
} from '@ai-sdk/open-responses';
import { generateText, tool, type ModelMessage } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

const webSearchExtension: Experimental_OpenResponsesBareExtension = {
  id: 'acme.web_search',
  allowBareTypes: true,
  bareToolType: 'web_search',
  bareItemTypes: ['web_search_call'],
  encodeTool: ({ name, args }) => ({
    name,
    search_context_size: args.searchContextSize as string,
  }),
  decodeItem: ({ item }) => {
    if (
      typeof item.call_id !== 'string' ||
      typeof item.name !== 'string' ||
      typeof item.query !== 'string'
    ) {
      return undefined;
    }

    return [
      {
        type: 'tool-call',
        toolCallId: item.call_id,
        toolName: item.name,
        input: JSON.stringify({ query: item.query }),
        providerExecuted: true,
      },
    ];
  },
};

const requestBodies: Array<Record<string, unknown>> = [];

const openResponses = createOpenResponses({
  name: 'acme',
  url: 'https://example.com/v1/responses',
  experimental_extensions: [webSearchExtension],
  fetch: async (_url, init) => {
    requestBodies.push(JSON.parse(init!.body as string));
    const firstTurn = requestBodies.length === 1;

    return Response.json({
      id: firstTurn ? 'response_1' : 'response_2',
      object: 'response',
      created_at: 0,
      status: 'completed',
      model: 'acme-model',
      output: firstTurn
        ? [
            {
              type: 'web_search_call',
              id: 'search_1',
              status: 'completed',
              call_id: 'call_1',
              name: 'webSearch',
              query: 'Open Responses bare extension codecs',
              opaque_receipt: { trace_id: 'trace_1' },
            },
          ]
        : [],
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        total_tokens: 2,
      },
    });
  },
});

const webSearch = tool({
  type: 'provider',
  id: 'acme.web_search',
  args: { searchContextSize: 'medium' },
  isProviderExecuted: true,
  inputSchema: z.object({ query: z.string() }),
});

run(async () => {
  const messages: ModelMessage[] = [
    {
      role: 'user',
      content: 'Find the Open Responses extension documentation.',
    },
  ];

  const first = await generateText({
    model: openResponses('acme-model'),
    messages,
    tools: { webSearch },
  });
  messages.push(...first.response.messages);

  await generateText({
    model: openResponses('acme-model'),
    messages,
    tools: { webSearch },
  });

  console.log('Encoded bare tool:', requestBodies[0].tools);
  console.log('Decoded tool call:', first.toolCalls[0]);
  console.log('Replayed bare item:', requestBodies[1].input);
});
