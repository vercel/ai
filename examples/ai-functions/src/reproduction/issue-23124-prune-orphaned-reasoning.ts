import assert from 'node:assert/strict';
import { pruneMessages, type ModelMessage } from 'ai';

const FAILURE_SIGNAL =
  'ISSUE_23124: pruneMessages kept orphaned reasoning after pruning tool calls';

const toolCall = (toolCallId: string, toolName: string) =>
  ({
    type: 'tool-call',
    toolCallId,
    toolName,
    input: {},
  }) as const;

async function main() {
  const failures: string[] = [];

  const checkPrimaryOutcome = ({
    scenario,
    actual,
    expected,
  }: {
    scenario: string;
    actual: ModelMessage[];
    expected: ModelMessage[];
  }) => {
    try {
      assert.deepEqual(actual, expected);
    } catch {
      failures.push(scenario);
    }
  };

  const fullyPrunedInput: ModelMessage[] = [
    {
      role: 'assistant',
      content: [
        { type: 'reasoning', text: 'I will call the first tool.' },
        toolCall('call-1', 'remove-me'),
        { type: 'reasoning', text: 'I will call the second tool.' },
        toolCall('call-2', 'remove-me'),
      ],
    },
  ];

  checkPrimaryOutcome({
    scenario:
      'default emptyMessages retained a reasoning-only assistant message',
    actual: pruneMessages({
      messages: fullyPrunedInput,
      reasoning: 'none',
      toolCalls: 'all',
    }),
    expected: [],
  });

  checkPrimaryOutcome({
    scenario: 'emptyMessages keep retained orphaned reasoning parts',
    actual: pruneMessages({
      messages: fullyPrunedInput,
      reasoning: 'none',
      toolCalls: 'all',
      emptyMessages: 'keep',
    }),
    expected: [{ role: 'assistant', content: [] }],
  });

  const selectiveInput: ModelMessage[] = [
    {
      role: 'assistant',
      content: [
        { type: 'reasoning', text: 'Only explains the removed tool.' },
        toolCall('call-removed', 'remove-me'),
        { type: 'reasoning', text: 'Explains retained text.' },
        { type: 'text', text: 'Retained answer.' },
        { type: 'reasoning', text: 'Explains the retained tool.' },
        toolCall('call-kept', 'keep-me'),
      ],
    },
  ];

  checkPrimaryOutcome({
    scenario:
      'selective pruning retained reasoning associated only with a removed tool',
    actual: pruneMessages({
      messages: selectiveInput,
      reasoning: 'none',
      toolCalls: [{ type: 'all', tools: ['remove-me'] }],
    }),
    expected: [
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'Explains retained text.' },
          { type: 'text', text: 'Retained answer.' },
          { type: 'reasoning', text: 'Explains the retained tool.' },
          toolCall('call-kept', 'keep-me'),
        ],
      },
    ],
  });

  if (failures.length > 0) {
    console.error(
      `${FAILURE_SIGNAL}\n${failures
        .map(failure => `- ${failure}`)
        .join('\n')}`,
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
