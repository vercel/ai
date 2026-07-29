import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { jsonSchema, stepCountIs, streamText, tool } from 'ai';

const failureSignal =
  'ISSUE #15789 REPRODUCED: duplicate text part id txt-0 merged text around tool call';

function sse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

const responses = [
  [
    sse({
      id: 'chatcmpl-step-1',
      object: 'chat.completion.chunk',
      created: 1711357598,
      model: 'test-model',
      choices: [
        {
          index: 0,
          delta: { role: 'assistant', content: "I'll check that..." },
          finish_reason: null,
        },
      ],
    }),
    sse({
      id: 'chatcmpl-step-1',
      object: 'chat.completion.chunk',
      created: 1711357598,
      model: 'test-model',
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_lookup_1',
                type: 'function',
                function: { name: 'lookup', arguments: '{}' },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    }),
    sse({
      id: 'chatcmpl-step-1',
      object: 'chat.completion.chunk',
      created: 1711357598,
      model: 'test-model',
      choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
    'data: [DONE]\n\n',
  ],
  [
    sse({
      id: 'chatcmpl-step-2',
      object: 'chat.completion.chunk',
      created: 1711357599,
      model: 'test-model',
      choices: [
        {
          index: 0,
          delta: { role: 'assistant', content: "Done, here's the result." },
          finish_reason: null,
        },
      ],
    }),
    sse({
      id: 'chatcmpl-step-2',
      object: 'chat.completion.chunk',
      created: 1711357599,
      model: 'test-model',
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
    'data: [DONE]\n\n',
  ],
];

type UiPart =
  | { type: 'text'; id: string; text: string }
  | { type: 'tool'; toolCallId: string };

async function main() {
  let requestCount = 0;

  const provider = createOpenAICompatible({
    name: 'local-openai-compatible',
    baseURL: 'https://local.test/v1',
    apiKey: 'test-api-key',
    fetch: async () => {
      const chunks = responses[requestCount++];
      if (chunks == null) {
        return new Response('unexpected extra request', { status: 500 });
      }

      return new Response(chunks.join(''), {
        headers: { 'content-type': 'text/event-stream' },
      });
    },
  });

  const result = streamText({
    model: provider.chatModel('test-model'),
    prompt: 'Please look this up.',
    tools: {
      lookup: tool({
        inputSchema: jsonSchema({
          type: 'object',
          properties: {},
          additionalProperties: false,
        }),
        execute: async () => ({ ok: true }),
      }),
    },
    stopWhen: stepCountIs(2),
  });

  const textStartIds: string[] = [];
  const uiParts: UiPart[] = [];

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-start': {
        textStartIds.push(part.id);
        if (
          !uiParts.some(item => item.type === 'text' && item.id === part.id)
        ) {
          uiParts.push({ type: 'text', id: part.id, text: '' });
        }
        break;
      }
      case 'text-delta': {
        const textPart = uiParts.find(
          item => item.type === 'text' && item.id === part.id,
        );
        if (textPart?.type === 'text') {
          textPart.text += part.text;
        }
        break;
      }
      case 'tool-call':
        uiParts.push({ type: 'tool', toolCallId: part.toolCallId });
        break;
    }
  }

  console.log(JSON.stringify({ requestCount, textStartIds, uiParts }, null, 2));

  const duplicateIds =
    textStartIds.length === 2 &&
    textStartIds[0] === 'txt-0' &&
    textStartIds[1] === 'txt-0';
  const textWasMergedAroundTool =
    uiParts.length === 2 &&
    uiParts[0]?.type === 'text' &&
    uiParts[0].text === "I'll check that...Done, here's the result." &&
    uiParts[1]?.type === 'tool';

  if (duplicateIds && textWasMergedAroundTool) {
    throw new Error(failureSignal);
  }

  console.log(
    'Issue #15789 was not reproduced: separate text segments retained distinct IDs and order.',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
