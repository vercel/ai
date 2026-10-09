import assert from 'node:assert/strict';
import { createAnthropic } from '@ai-sdk/anthropic';
import {
  convertToModelMessages,
  generateText,
  type JSONValue,
  type ModelMessage,
  type UIMessage,
} from 'ai';

const exactReportedModel = 'claude-sonnet-4-20250514';
const substituteReportedModel = 'claude-haiku-4-5';

type AnthropicRequest = {
  model: string;
  messages: Array<{
    role: 'assistant' | 'user';
    content: Array<{
      type: string;
      id?: string;
      tool_use_id?: string;
    }>;
  }>;
};

const requests: AnthropicRequest[] = [];

const anthropic = createAnthropic({
  fetch: async (url, options) => {
    requests.push(JSON.parse(options!.body as string) as AnthropicRequest);
    return fetch(url, options);
  },
});

function jsonOutput(value: JSONValue) {
  return { type: 'json' as const, value };
}

function originalMessages(): ModelMessage[] {
  return [
    {
      role: 'user',
      content: [{ type: 'text', text: 'generate 10 items' }],
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'tool-example-123',
          toolName: 'json',
          input: { message: 'generate 10 items' },
        },
        {
          type: 'text',
          text: 'I generated code for 10 items.',
        },
      ],
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'tool-example-123',
          toolName: 'json',
          output: jsonOutput({
            code: 'export const code = () => [...]',
            packageJson: '{}',
          }),
        },
      ],
    },
    {
      role: 'user',
      content: [{ type: 'text', text: 'generate 100 items' }],
    },
  ];
}

function parallelMessages(): ModelMessage[] {
  return [
    {
      role: 'user',
      content: [{ type: 'text', text: 'Generate two values.' }],
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'parallel-1',
          toolName: 'json',
          input: { message: 'first' },
        },
        {
          type: 'tool-call',
          toolCallId: 'parallel-2',
          toolName: 'json',
          input: { message: 'second' },
        },
      ],
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'parallel-1',
          toolName: 'json',
          output: jsonOutput({ value: 1 }),
        },
        {
          type: 'tool-result',
          toolCallId: 'parallel-2',
          toolName: 'json',
          output: jsonOutput({ value: 2 }),
        },
      ],
    },
    {
      role: 'user',
      content: [{ type: 'text', text: 'Reply with one short sentence.' }],
    },
  ];
}

function terminalToolResultMessages(): ModelMessage[] {
  return [
    {
      role: 'user',
      content: [{ type: 'text', text: 'Generate a value and summarize it.' }],
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'terminal-1',
          toolName: 'json',
          input: { message: 'terminal result' },
        },
      ],
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'terminal-1',
          toolName: 'json',
          output: jsonOutput({ value: 42 }),
        },
      ],
    },
  ];
}

async function callAnthropic({
  modelId,
  messages,
}: {
  modelId: string;
  messages: ModelMessage[];
}) {
  const requestIndex = requests.length;

  await generateText({
    model: anthropic(modelId),
    system: 'Reply briefly without calling any more tools.',
    messages,
    maxOutputTokens: 32,
  });

  return requests[requestIndex];
}

function isUnavailableModel(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error != null &&
    'statusCode' in error &&
    error.statusCode === 404
  );
}

function assertOriginalRequest(request: AnthropicRequest) {
  assert.deepEqual(
    request.messages[1].content.map(part => part.type),
    ['text', 'tool_use'],
    'AI SDK must move the client tool_use after assistant text',
  );
  assert.deepEqual(
    request.messages[2].content.map(part => part.type),
    ['tool_result', 'text'],
    'AI SDK must put tool_result before following user text',
  );
  assert.equal(request.messages[2].content[0].tool_use_id, 'tool-example-123');
}

function assertParallelRequest(request: AnthropicRequest) {
  assert.deepEqual(
    request.messages[1].content.map(part => part.type),
    ['tool_use', 'tool_use'],
  );
  assert.deepEqual(
    request.messages[2].content.map(part => part.type),
    ['tool_result', 'tool_result', 'text'],
  );
  assert.deepEqual(
    request.messages[2].content
      .filter(part => part.type === 'tool_result')
      .map(part => part.tool_use_id),
    ['parallel-1', 'parallel-2'],
  );
}

async function main() {
  let modelId = exactReportedModel;
  let originalRequest: AnthropicRequest;

  try {
    originalRequest = await callAnthropic({
      modelId,
      messages: originalMessages(),
    });
  } catch (error) {
    if (!isUnavailableModel(error)) {
      throw error;
    }

    console.log(
      `exact reported model unavailable (HTTP 404): ${exactReportedModel}`,
    );
    modelId = substituteReportedModel;
    originalRequest = await callAnthropic({
      modelId,
      messages: originalMessages(),
    });
  }

  assertOriginalRequest(originalRequest);
  console.log(`original complete history succeeded with ${modelId}`);

  const parallelRequest = await callAnthropic({
    modelId,
    messages: parallelMessages(),
  });
  assertParallelRequest(parallelRequest);
  console.log('grouped parallel tool calls and results succeeded');

  await callAnthropic({
    modelId,
    messages: terminalToolResultMessages(),
  });
  console.log('terminal tool-result history succeeded without an empty user');

  const withoutStepStart: UIMessage[] = [
    {
      id: 'assistant-without-step-start',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'I will produce a value.', state: 'done' },
        {
          type: 'dynamic-tool',
          toolName: 'json',
          state: 'output-available',
          toolCallId: 'without-step-start-1',
          input: { message: 'value' },
          output: { value: 1 },
        },
        { type: 'text', text: 'The tool was called.', state: 'done' },
      ],
    },
    {
      id: 'user-after-tool',
      role: 'user',
      parts: [{ type: 'text', text: 'Reply briefly.' }],
    },
  ];
  const withoutStepStartModelMessages =
    await convertToModelMessages(withoutStepStart);
  const withoutStepStartRequest = await callAnthropic({
    modelId,
    messages: withoutStepStartModelMessages,
  });
  assert.deepEqual(
    withoutStepStartRequest.messages[0].content.map(part => part.type),
    ['text', 'text', 'tool_use'],
  );
  assert.deepEqual(
    withoutStepStartRequest.messages[1].content.map(part => part.type),
    ['tool_result', 'text'],
  );
  console.log('complete UI tool part succeeded without a step-start part');

  const incompleteUIHistory: UIMessage[] = [
    {
      id: 'assistant-with-incomplete-tool',
      role: 'assistant',
      parts: [
        { type: 'step-start' },
        {
          type: 'dynamic-tool',
          toolName: 'json',
          state: 'output-available',
          toolCallId: 'complete-1',
          input: { message: 'complete' },
          output: { value: 1 },
        },
        { type: 'step-start' },
        {
          type: 'dynamic-tool',
          toolName: 'json',
          state: 'input-available',
          toolCallId: 'incomplete-1',
          input: { message: 'incomplete' },
        },
        { type: 'text', text: 'Continue.', state: 'done' },
      ],
    },
    {
      id: 'user-after-incomplete-tool',
      role: 'user',
      parts: [{ type: 'text', text: 'Reply briefly.' }],
    },
  ];

  const unfiltered = await convertToModelMessages(incompleteUIHistory);
  assert.ok(
    unfiltered.some(
      message =>
        message.role === 'assistant' &&
        Array.isArray(message.content) &&
        message.content.some(
          part =>
            part.type === 'tool-call' && part.toolCallId === 'incomplete-1',
        ),
    ),
    'the default conversion preserves incomplete tool calls',
  );

  const filtered = await convertToModelMessages(incompleteUIHistory, {
    ignoreIncompleteToolCalls: true,
  });
  assert.ok(
    filtered.every(
      message =>
        message.role !== 'assistant' ||
        !Array.isArray(message.content) ||
        message.content.every(
          part =>
            part.type !== 'tool-call' || part.toolCallId !== 'incomplete-1',
        ),
    ),
    'ignoreIncompleteToolCalls must filter the orphan tool call',
  );
  await callAnthropic({ modelId, messages: filtered });
  console.log('documented incomplete-tool filtering succeeded');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
