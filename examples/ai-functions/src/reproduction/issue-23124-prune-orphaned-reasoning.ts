import assert from 'node:assert/strict';
import { pruneMessages, type ModelMessage } from 'ai';

const toolCall = (toolCallId: string, toolName: string) =>
  ({
    type: 'tool-call',
    toolCallId,
    toolName,
    input: {},
  }) as const;

class OrphanedReasoningError extends Error {}

function assertNoOrphanedReasoning(
  actual: ModelMessage[],
  expected: ModelMessage[],
  scenario: string,
) {
  try {
    assert.deepEqual(actual, expected);
  } catch {
    throw new OrphanedReasoningError(
      `${scenario} left reasoning whose following tool call was pruned`,
    );
  }
}

async function main() {
  const orphanedReasoningInput: ModelMessage[] = [
    {
      role: 'assistant',
      content: [
        { type: 'reasoning', text: 'I will call the first tool.' },
        toolCall('call-1', 'remove-me'),
        {
          type: 'reasoning-file',
          mediaType: 'image/png',
          data: 'reasoning-image',
        },
        toolCall('call-2', 'remove-me'),
      ],
    },
  ];

  const failures: string[] = [];
  const check = (
    scenario: string,
    actual: ModelMessage[],
    expected: ModelMessage[],
  ) => {
    try {
      assertNoOrphanedReasoning(actual, expected, scenario);
    } catch (error) {
      if (!(error instanceof OrphanedReasoningError)) throw error;
      failures.push(error.message);
    }
  };

  // Both reasoning kinds become orphaned, so pruning the tool calls should
  // remove the now-empty assistant message with the default emptyMessages mode.
  check(
    'reasoning and reasoning-file',
    pruneMessages({
      messages: orphanedReasoningInput,
      toolCalls: 'all',
    }),
    [],
  );

  // emptyMessages: "keep" should expose the same reasoning pruning while
  // retaining the assistant message itself.
  check(
    'emptyMessages keep',
    pruneMessages({
      messages: orphanedReasoningInput,
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

  // A following reasoning part starts a new segment: only the reasoning whose
  // whole segment was pruned should disappear.
  check(
    'selective tool pruning',
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

  // Controls: reasoning that still precedes retained content must keep the
  // existing reasoning: "none" behavior.
  const followedByTextInput: ModelMessage[] = [
    {
      role: 'assistant',
      content: [
        { type: 'reasoning', text: 'This still explains retained text.' },
        toolCall('call-3', 'remove-me'),
        { type: 'text', text: 'Retained answer.' },
      ],
    },
  ];
  assert.deepEqual(
    pruneMessages({
      messages: followedByTextInput,
      reasoning: 'none',
      toolCalls: 'all',
    }),
    [
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'This still explains retained text.' },
          { type: 'text', text: 'Retained answer.' },
        ],
      },
    ],
    'reasoning followed by retained text must stay',
  );

  if (failures.length > 0) {
    console.error(
      'ISSUE_23124: pruneMessages kept orphaned reasoning after pruning tool calls\n' +
        failures.map(failure => `- ${failure}`).join('\n'),
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
