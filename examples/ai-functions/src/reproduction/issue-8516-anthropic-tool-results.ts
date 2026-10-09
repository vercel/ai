import assert from 'node:assert/strict';
import { createAnthropic } from '../../../../packages/anthropic/src';
import {
  convertToModelMessages,
  generateText,
  type ModelMessage,
  type UIMessage,
} from '../../../../packages/ai/src';

const liveModel = 'claude-haiku-4-5-20251001';

type AnthropicRequest = {
  messages: Array<{
    role: 'assistant' | 'user';
    content: Array<{
      type: string;
      id?: string;
      tool_use_id?: string;
    }>;
  }>;
};

async function runLiveScenario({
  name,
  messages,
  verifyRequest,
}: {
  name: string;
  messages: ModelMessage[];
  verifyRequest: (request: AnthropicRequest) => void;
}) {
  let request: AnthropicRequest | undefined;

  const anthropic = createAnthropic({
    fetch: async (url, options) => {
      request = JSON.parse(String(options?.body)) as AnthropicRequest;
      return fetch(url, options);
    },
  });

  const result = await generateText({
    model: anthropic(liveModel),
    system: 'Reply briefly and do not call tools.',
    messages,
    maxOutputTokens: 32,
  });

  assert.ok(request, `${name}: Anthropic request was not captured`);
  verifyRequest(request);
  assert.notEqual(
    result.finishReason,
    'error',
    `${name}: Anthropic returned an error finish reason`,
  );

  console.log(`PASS ${name}`);
}

function contentTypes(
  request: AnthropicRequest,
  messageIndex: number,
): string[] {
  return request.messages[messageIndex].content.map(part => part.type);
}

async function main() {
  const originalCompleteHistory: ModelMessage[] = [
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
          output: {
            type: 'json',
            value: {
              code: 'export const code = () => [...]',
              packageJson: '{}',
            },
          },
        },
      ],
    },
    {
      role: 'user',
      content: [{ type: 'text', text: 'generate 100 items' }],
    },
  ];

  await runLiveScenario({
    name: 'original complete history',
    messages: originalCompleteHistory,
    verifyRequest: request => {
      assert.deepEqual(
        request.messages.map(message => message.role),
        ['user', 'assistant', 'user'],
      );
      assert.deepEqual(contentTypes(request, 1), ['text', 'tool_use']);
      assert.deepEqual(contentTypes(request, 2), ['tool_result', 'text']);
      assert.equal(
        request.messages[1].content[1].id,
        request.messages[2].content[0].tool_use_id,
      );
    },
  });

  const parallelHistory: ModelMessage[] = [
    {
      role: 'user',
      content: [{ type: 'text', text: 'Run both checks.' }],
    },
    {
      role: 'assistant',
      content: [
        { type: 'text', text: 'Starting the first check.' },
        {
          type: 'tool-call',
          toolCallId: 'parallel-1',
          toolName: 'checkOne',
          input: { value: 1 },
        },
        { type: 'text', text: 'Starting the second check.' },
        {
          type: 'tool-call',
          toolCallId: 'parallel-2',
          toolName: 'checkTwo',
          input: { value: 2 },
        },
      ],
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'parallel-1',
          toolName: 'checkOne',
          output: { type: 'json', value: { ok: true } },
        },
        {
          type: 'tool-result',
          toolCallId: 'parallel-2',
          toolName: 'checkTwo',
          output: { type: 'json', value: { ok: true } },
        },
      ],
    },
    {
      role: 'user',
      content: [{ type: 'text', text: 'Summarize both checks.' }],
    },
  ];

  await runLiveScenario({
    name: 'grouped parallel calls and results',
    messages: parallelHistory,
    verifyRequest: request => {
      assert.deepEqual(contentTypes(request, 1), [
        'text',
        'text',
        'tool_use',
        'tool_use',
      ]);
      assert.deepEqual(contentTypes(request, 2), [
        'tool_result',
        'tool_result',
        'text',
      ]);
    },
  });

  await runLiveScenario({
    name: 'terminal grouped tool results',
    messages: parallelHistory.slice(0, -1),
    verifyRequest: request => {
      assert.equal(request.messages.at(-1)?.role, 'user');
      assert.deepEqual(contentTypes(request, request.messages.length - 1), [
        'tool_result',
        'tool_result',
      ]);
    },
  });

  const persistedUiMessages: UIMessage[] = [
    {
      id: 'assistant-message',
      role: 'assistant',
      parts: [
        { type: 'step-start' },
        {
          type: 'tool-checkOne',
          state: 'output-available',
          toolCallId: 'complete-call',
          input: { value: 1 },
          output: { ok: true },
        },
        { type: 'step-start' },
        {
          type: 'tool-checkTwo',
          state: 'input-available',
          toolCallId: 'incomplete-call',
          input: { value: 2 },
        },
        { type: 'text', text: 'The completed check passed.', state: 'done' },
      ],
    },
    {
      id: 'user-message',
      role: 'user',
      parts: [{ type: 'text', text: 'Continue.' }],
    },
  ];

  const unfiltered = convertToModelMessages(persistedUiMessages);
  assert.ok(
    unfiltered.some(
      message =>
        message.role === 'assistant' &&
        message.content.some(
          part =>
            part.type === 'tool-call' && part.toolCallId === 'incomplete-call',
        ),
    ),
    'the default conversion should preserve the incomplete call',
  );
  assert.ok(
    !unfiltered.some(
      message =>
        message.role === 'tool' &&
        message.content.some(
          part =>
            part.type === 'tool-result' &&
            part.toolCallId === 'incomplete-call',
        ),
    ),
    'the incomplete call must not have a fabricated result',
  );

  const filtered = convertToModelMessages(persistedUiMessages, {
    ignoreIncompleteToolCalls: true,
  });
  assert.ok(
    !filtered.some(
      message =>
        message.role === 'assistant' &&
        message.content.some(
          part =>
            part.type === 'tool-call' && part.toolCallId === 'incomplete-call',
        ),
    ),
    'ignoreIncompleteToolCalls should remove the incomplete call',
  );

  await runLiveScenario({
    name: 'persisted UI history with incomplete calls ignored',
    messages: filtered,
    verifyRequest: request => {
      const allContent = request.messages.flatMap(message => message.content);
      assert.ok(
        !allContent.some(
          part =>
            part.id === 'incomplete-call' ||
            part.tool_use_id === 'incomplete-call',
        ),
      );
      assert.ok(
        allContent.some(
          part =>
            part.id === 'complete-call' || part.tool_use_id === 'complete-call',
        ),
      );
    },
  });

  console.log(`ISSUE_8516_NOT_REPRODUCED model=${liveModel}`);
}

main().catch(error => {
  console.error('ISSUE_8516_REPRODUCTION_FAILED');
  console.error(error);
  process.exitCode = 1;
});
