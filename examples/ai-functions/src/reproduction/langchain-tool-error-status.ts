import assert from 'node:assert/strict';
import { convertModelMessages } from '@ai-sdk/langchain';
import type { ToolMessage } from '@langchain/core/messages';
import type { ModelMessage, ToolResultPart } from 'ai';

async function main() {
  const cases: Array<{
    output: ToolResultPart['output'];
    expectedContent: string;
    expectedError: boolean;
  }> = [
    {
      output: { type: 'error-text', value: 'lookup failed' },
      expectedContent: 'lookup failed',
      expectedError: true,
    },
    {
      output: {
        type: 'error-json',
        value: { message: 'lookup failed' },
      },
      expectedContent: '{"message":"lookup failed"}',
      expectedError: true,
    },
    {
      output: { type: 'text', value: 'ordinary text containing error' },
      expectedContent: 'ordinary text containing error',
      expectedError: false,
    },
    {
      output: { type: 'json', value: { message: 'ordinary error text' } },
      expectedContent: '{"message":"ordinary error text"}',
      expectedError: false,
    },
  ];

  const statuses: Array<ToolMessage['status']> = [];

  for (const [index, testCase] of cases.entries()) {
    const toolCallId = `call-${index + 1}`;
    const messages: ModelMessage[] = [
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolName: 'lookup',
            toolCallId,
            output: testCase.output,
          },
        ],
      },
    ];

    const [result] = convertModelMessages(messages) as ToolMessage[];

    assert.equal(result.tool_call_id, toolCallId);
    assert.equal(result.content, testCase.expectedContent);

    if (testCase.expectedError) {
      statuses.push(result.status);
    } else {
      assert.notEqual(
        result.status,
        'error',
        'successful tool outputs must not be classified as errors',
      );
    }
  }

  assert.deepEqual(
    statuses,
    ['error', 'error'],
    'ISSUE #22786: error-text and error-json must convert to ToolMessage status "error"',
  );
}

main();
