import assert from 'node:assert/strict';
import { pruneMessages, type ModelMessage } from 'ai';

async function main() {
  const messages: ModelMessage[] = [
    {
      role: 'user',
      content: 'What is the weather in Paris?',
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'I will check.',
        },
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'getWeather',
          input: { city: 'Paris' },
        },
      ],
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'getWeather',
          output: { type: 'text', value: 'Sunny' },
        },
      ],
    },
  ];

  const expected = pruneMessages({
    messages,
    toolCalls: 'all',
  });
  const actual = pruneMessages({
    messages,
    toolCalls: 'before-last-0-messages',
  });

  assert.equal(
    expected.some(
      message =>
        Array.isArray(message.content) &&
        message.content.some(
          part => part.type === 'tool-call' || part.type === 'tool-result',
        ),
    ),
    false,
    "Reproduction precondition failed: toolCalls: 'all' must remove tool content",
  );
  assert.deepEqual(
    actual,
    expected,
    'ISSUE_21722: before-last-0-messages retained tool content instead of matching toolCalls all',
  );
}

main();
