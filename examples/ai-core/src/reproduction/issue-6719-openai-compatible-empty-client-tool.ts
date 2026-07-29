import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText, tool } from 'ai';
import { z } from 'zod';

const toolCallId = 'toolu_issue_6719';
let requestBody: Record<string, unknown> | undefined;

const openrouterCompatible = createOpenAICompatible({
  name: 'openrouter',
  baseURL: 'https://openrouter.ai/api/v1',
  fetch: async (_input, init) => {
    if (typeof init?.body !== 'string') {
      throw new Error('Expected the OpenAI-compatible request body as JSON.');
    }

    requestBody = JSON.parse(init.body);

    const chunks = [
      {
        id: 'chatcmpl-issue-6719',
        object: 'chat.completion.chunk',
        created: 1_751_000_000,
        model: 'anthropic/claude-3.7-sonnet',
        choices: [
          {
            index: 0,
            delta: {
              role: 'assistant',
              content: 'I will generate a lucky number.',
            },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-issue-6719',
        object: 'chat.completion.chunk',
        created: 1_751_000_000,
        model: 'anthropic/claude-3.7-sonnet',
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
        created: 1_751_000_000,
        model: 'anthropic/claude-3.7-sonnet',
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
        headers: {
          'content-type': 'text/event-stream',
        },
      },
    );
  },
});

async function main() {
  const result = streamText({
    model: openrouterCompatible('anthropic/claude-3.7-sonnet'),
    prompt: 'Generate a lucky number.',
    tools: {
      getLuckyNumber: tool({
        description: 'Generate a lucky number.',
        inputSchema: z.object({}),
      }),
    },
  });

  const uiParts = [];
  for await (const part of result.toUIMessageStream()) {
    uiParts.push(part);
  }

  const sentTools = requestBody?.tools;
  const toolWasRegistered =
    Array.isArray(sentTools) &&
    sentTools.some(
      value =>
        typeof value === 'object' &&
        value != null &&
        'function' in value &&
        typeof value.function === 'object' &&
        value.function != null &&
        'name' in value.function &&
        value.function.name === 'getLuckyNumber',
    );

  const clientToolCall = uiParts.find(
    part => part.type === 'tool-input-available',
  );
  const finish = uiParts.find(part => part.type === 'finish');

  if (!toolWasRegistered) {
    throw new Error(
      'Issue #6719 reproduced: getLuckyNumber was omitted from the provider request.',
    );
  }

  if (
    clientToolCall == null ||
    clientToolCall.toolCallId !== toolCallId ||
    clientToolCall.toolName !== 'getLuckyNumber'
  ) {
    throw new Error(
      'Issue #6719 reproduced: client-side getLuckyNumber tool call was omitted.',
    );
  }

  if (
    JSON.stringify(clientToolCall.input) !== JSON.stringify({}) ||
    finish?.finishReason !== 'tool-calls'
  ) {
    throw new Error(
      `Unexpected tool call result: ${JSON.stringify({ clientToolCall, finish })}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        toolWasRegistered,
        clientToolCall,
        finishReason: finish.finishReason,
      },
      null,
      2,
    ),
  );
  console.log(
    'Issue #6719 not reproduced: the empty client-side tool call was emitted.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
