import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText, tool, type UIMessageChunk } from 'ai';
import { z } from 'zod';

const toolCallId = 'toolu_issue_6719';
const toolName = 'getLuckyNumber';

async function main() {
  let requestBody: unknown;

  const provider = createOpenAICompatible({
    name: 'openrouter',
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: 'test-api-key',
    fetch: async (_input, init) => {
      requestBody =
        typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;

      const chunks = [
        {
          id: 'chatcmpl-issue-6719',
          object: 'chat.completion.chunk',
          created: 1_751_430_400,
          model: 'anthropic/claude-sonnet-4',
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                content: '我来为您生成一个新的幸运数字！',
              },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'chatcmpl-issue-6719',
          object: 'chat.completion.chunk',
          created: 1_751_430_400,
          model: 'anthropic/claude-sonnet-4',
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: toolCallId,
                    type: 'function',
                    function: {
                      name: toolName,
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
          created: 1_751_430_400,
          model: 'anthropic/claude-sonnet-4',
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: 'tool_calls',
            },
          ],
          usage: {
            prompt_tokens: 713,
            completion_tokens: 55,
            total_tokens: 768,
          },
        },
      ];

      return new Response(
        `${chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`,
        {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        },
      );
    },
  });

  const result = streamText({
    model: provider.chatModel('anthropic/claude-sonnet-4'),
    prompt: 'Generate a lucky number.',
    maxRetries: 0,
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

  const clientToolCall = uiChunks.find(
    chunk =>
      chunk.type === 'tool-input-available' &&
      chunk.toolCallId === toolCallId &&
      chunk.toolName === toolName,
  );

  const requestTools =
    requestBody != null &&
    typeof requestBody === 'object' &&
    'tools' in requestBody &&
    Array.isArray(requestBody.tools)
      ? requestBody.tools
      : [];

  const output = {
    expected:
      'A client-side tool with no execute function is included in the UI message stream even when the provider streams an empty argument string.',
    requestIncludedTool: requestTools.some(
      requestTool =>
        requestTool != null &&
        typeof requestTool === 'object' &&
        'function' in requestTool &&
        requestTool.function != null &&
        typeof requestTool.function === 'object' &&
        'name' in requestTool.function &&
        requestTool.function.name === toolName,
    ),
    clientToolCall,
    finishChunk: uiChunks.find(chunk => chunk.type === 'finish'),
  };

  console.log(JSON.stringify(output, null, 2));

  if (clientToolCall == null) {
    throw new Error(
      'Reproduced issue #6719: finish reason was tool-calls but the client UI stream omitted getLuckyNumber.',
    );
  }

  if (
    !('input' in clientToolCall) ||
    JSON.stringify(clientToolCall.input) !== '{}'
  ) {
    throw new Error(
      'Issue #6719 narrowing check failed: the client tool call did not normalize empty arguments to an empty object.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
