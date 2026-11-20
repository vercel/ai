import assert from 'node:assert/strict';
import { pruneMessages, type ModelMessage } from 'ai';

const ISSUE_SIGNAL =
  'ISSUE_23124: pruneMessages kept orphaned reasoning after pruning tool calls';

function toolCall(toolCallId: string, toolName: string) {
  return {
    type: 'tool-call' as const,
    toolCallId,
    toolName,
    input: {},
  };
}

async function main() {
  const failures: string[] = [];

  function checkPrimary(
    scenario: string,
    actual: ModelMessage[],
    expected: ModelMessage[],
  ) {
    try {
      assert.deepEqual(actual, expected);
    } catch {
      failures.push(scenario);
    }
  }

  const fullyPrunedInput: ModelMessage[] = [
    {
      role: 'assistant',
      content: [
        { type: 'reasoning', text: 'I will call the removed tool.' },
        toolCall('call-removed', 'remove-me'),
      ],
    },
  ];

  checkPrimary(
    'default emptyMessages did not remove the orphaned reasoning-only message',
    pruneMessages({
      messages: fullyPrunedInput,
      toolCalls: 'all',
    }),
    [],
  );

  checkPrimary(
    'emptyMessages: keep did not leave an empty assistant message',
    pruneMessages({
      messages: fullyPrunedInput,
      toolCalls: 'all',
      emptyMessages: 'keep',
    }),
    [{ role: 'assistant', content: [] }],
  );

  const selectiveInput: ModelMessage[] = [
    {
      role: 'assistant',
      content: [
        { type: 'reasoning', text: 'Only explains the removed tool.' },
        toolCall('call-removed', 'remove-me'),
        { type: 'reasoning', text: 'Explains the retained tool.' },
        toolCall('call-kept', 'keep-me'),
      ],
    },
  ];

  checkPrimary(
    'selective pruning kept reasoning associated only with a removed tool',
    pruneMessages({
      messages: selectiveInput,
      toolCalls: [{ type: 'all', tools: ['remove-me'] }],
    }),
    [
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'Explains the retained tool.' },
          toolCall('call-kept', 'keep-me'),
        ],
      },
    ],
  );

  // Controls: a fix must not remove reasoning that still precedes retained
  // content, or reasoning from a message where no following content was pruned.
  assert.deepEqual(
    pruneMessages({
      messages: [
        {
          role: 'assistant',
          content: [
            { type: 'reasoning', text: 'Explains retained text.' },
            toolCall('call-removed', 'remove-me'),
            { type: 'text', text: 'Retained answer.' },
          ],
        },
      ],
      reasoning: 'none',
      toolCalls: 'all',
    }),
    [
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'Explains retained text.' },
          { type: 'text', text: 'Retained answer.' },
        ],
      },
    ],
    'reasoning followed by retained text must stay',
  );

  const standaloneReasoning: ModelMessage[] = [
    {
      role: 'assistant',
      content: [{ type: 'reasoning', text: 'Standalone reasoning.' }],
    },
  ];
  assert.deepEqual(
    pruneMessages({
      messages: standaloneReasoning,
      reasoning: 'none',
      toolCalls: 'all',
    }),
    standaloneReasoning,
    'reasoning without pruned following content must stay',
  );

  if (failures.length > 0) {
    console.error(
      `${ISSUE_SIGNAL}\n${failures.map(failure => `- ${failure}`).join('\n')}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log('Issue #23124 did not reproduce.');
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
