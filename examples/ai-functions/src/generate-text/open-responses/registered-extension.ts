import {
  createOpenResponses,
  type Experimental_OpenResponsesExtension,
} from '@ai-sdk/open-responses';
import { generateText, tool, type ModelMessage } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

const documentSearchExtension: Experimental_OpenResponsesExtension = {
  id: 'acme.document_search',
  toolType: 'acme:document_search',
  itemTypes: ['acme:document_search_source', 'acme:document_search_receipt'],
  encodeTool: ({ name, args }) => ({
    name,
    index: args.index as string,
  }),
  decodeItem: ({ item }) =>
    item.type === 'acme:document_search_source'
      ? [
          {
            type: 'source',
            sourceType: 'url',
            id: item.id,
            url: item.url as string,
            title: item.title as string,
          },
        ]
      : [
          {
            type: 'tool-call',
            toolCallId: item.call_id as string,
            toolName: item.name as string,
            input: JSON.stringify(item.query),
            providerExecuted: true,
          },
          {
            type: 'tool-result',
            toolCallId: item.call_id as string,
            toolName: item.name as string,
            result: item.result!,
          },
        ],
};

const requestBodies: Array<Record<string, unknown>> = [];

const openResponses = createOpenResponses({
  name: 'acme',
  url: 'https://example.com/v1/responses',
  experimental_extensions: [documentSearchExtension],
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
              type: 'acme:document_search_source',
              id: 'source_1',
              status: 'completed',
              url: 'https://ai-sdk.dev/providers/ai-sdk-providers/open-responses',
              title: 'Open Responses provider',
              opaque_receipt: { trace_id: 'trace_source_1' },
            },
            {
              type: 'acme:document_search_receipt',
              id: 'search_1',
              status: 'completed',
              call_id: 'call_1',
              name: 'documentSearch',
              query: { text: 'Open Responses extensions' },
              result: {
                documents: [{ id: 'doc_1', title: 'Extension guide' }],
              },
              opaque_receipt: { trace_id: 'trace_1' },
            },
            {
              type: 'message',
              id: 'message_1',
              status: 'completed',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: 'Found the extension guide.',
                  annotations: [],
                  logprobs: [],
                },
              ],
            },
          ]
        : [
            {
              type: 'message',
              id: 'message_2',
              status: 'completed',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: 'The original receipt was replayed.',
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
      },
    });
  },
});

const documentSearch = tool({
  type: 'provider',
  id: 'acme.document_search',
  args: { index: 'documentation' },
  isProviderExecuted: true,
  inputSchema: z.object({ text: z.string() }),
  outputSchema: z.object({
    documents: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
      }),
    ),
  }),
});

run(async () => {
  const messages: ModelMessage[] = [
    {
      role: 'user',
      content: 'Find documentation about Open Responses extensions.',
    },
  ];

  const first = await generateText({
    model: openResponses('acme-model'),
    messages,
    tools: { documentSearch },
  });
  messages.push(...first.response.messages);
  messages.push({
    role: 'user',
    content: 'Confirm that the search receipt remains in the history.',
  });

  await generateText({
    model: openResponses('acme-model'),
    messages,
    tools: { documentSearch },
  });

  console.log('Encoded tool:', requestBodies[0].tools);
  console.log('Provider executed:', first.toolCalls[0]?.providerExecuted);
  console.log('Replayed input:', requestBodies[1].input);
});
