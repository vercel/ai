import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText, tool, type UIMessageChunk } from 'ai';
import { z } from 'zod';

const encoder = new TextEncoder();

const responseChunks = [
  {
    id: 'chatcmpl-issue-6719',
    object: 'chat.completion.chunk',
    created: 1711357598,
    model: 'anthropic/claude-sonnet-4',
    choices: [
      {
        index: 0,
        delta: { role: 'assistant', content: '我来为您' },
        finish_reason: null,
      },
    ],
  },
  {
    id: 'chatcmpl-issue-6719',
    object: 'chat.completion.chunk',
    created: 1711357598,
    model: 'anthropic/claude-sonnet-4',
    choices: [
      {
        index: 0,
        delta: { content: '生成一个新的幸运数字！' },
        finish_reason: null,
      },
    ],
  },
  {
    id: 'chatcmpl-issue-6719',
    object: 'chat.completion.chunk',
    created: 1711357598,
    model: 'anthropic/claude-sonnet-4',
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [
            {
              index: 0,
              id: 'toolu_issue_6719',
              type: 'function',
              function: {
                name: 'getLuckyNumber',
                arguments: '',
              },
            },
          ],
        },
        finish_reason: null,
      },
    ],
  },
  {
    id: 'chatcmpl-issue-6719',
    object: 'chat.completion.chunk',
    created: 1711357598,
    model: 'anthropic/claude-sonnet-4',
    choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
    usage: {
      prompt_tokens: 713,
      completion_tokens: 55,
      total_tokens: 768,
    },
  },
];

async function main() {
  let requestBody: any;

  const openrouterCompatible = createOpenAICompatible({
    name: 'OpenRouter',
    apiKey: 'test-api-key',
    baseURL: 'https://openrouter.ai/api/v1',
    fetch: async (_input, init) => {
      requestBody =
        typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;

      return new Response(
        new ReadableStream({
          start(controller) {
            for (const chunk of responseChunks) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
              );
            }
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          },
        }),
        {
          headers: { 'content-type': 'text/event-stream' },
          status: 200,
        },
      );
    },
  });

  const result = streamText({
    model: openrouterCompatible.chatModel('anthropic/claude-sonnet-4'),
    prompt: 'Generate a new lucky number for me.',
    tools: {
      getLuckyNumber: tool({
        description: 'Get a random lucky number between 1 and 100.',
        inputSchema: z.object({}),
      }),
    },
  });

  const uiChunks: UIMessageChunk[] = [];
  for await (const chunk of result.toUIMessageStream()) {
    uiChunks.push(chunk);
  }

  const toolCallChunk = uiChunks.find(
    (
      chunk,
    ): chunk is Extract<
      (typeof uiChunks)[number],
      { type: 'tool-input-available' }
    > =>
      chunk.type === 'tool-input-available' &&
      chunk.toolName === 'getLuckyNumber',
  );
  const finishReason = await result.finishReason;
  const registeredTool = requestBody?.tools?.find(
    (candidate: any) =>
      candidate.type === 'function' &&
      candidate.function?.name === 'getLuckyNumber',
  );

  console.log(
    JSON.stringify(
      {
        registeredClientTool: registeredTool != null,
        toolCallChunk,
        finishReason,
      },
      null,
      2,
    ),
  );

  if (registeredTool == null) {
    throw new Error(
      'The client-side getLuckyNumber tool was omitted from the provider request.',
    );
  }

  if (
    toolCallChunk == null ||
    toolCallChunk.toolCallId !== 'toolu_issue_6719' ||
    JSON.stringify(toolCallChunk.input) !== '{}'
  ) {
    throw new Error(
      'Reproduced issue #6719: the client-side getLuckyNumber tool call was omitted from the UI message stream.',
    );
  }

  if (finishReason !== 'tool-calls') {
    throw new Error('Expected the stream to finish with tool-calls.');
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
