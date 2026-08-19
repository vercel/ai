import assert from 'node:assert/strict';
import { convertToModelMessages, tool, type UIMessage } from 'ai';
import { z } from 'zod';

const leakedOutputMarker = 'PRELIMINARY-OUTPUT-SENT-AS-FINAL';
const failureSignal =
  'ISSUE #19080 reproduced: ignoreIncompleteToolCalls retained a preliminary tool output';

async function main() {
  let toModelOutputCalls = 0;

  const streamingTool = tool({
    inputSchema: z.object({ task: z.string() }),
    execute: async function* () {
      yield { complete: false, progress: 'half finished' };
      yield { complete: true, result: 'finished' };
    },
    toModelOutput: ({ output }) => {
      toModelOutputCalls++;
      return {
        type: 'text',
        value: `${leakedOutputMarker}:${JSON.stringify(output)}`,
      };
    },
  });

  const persistedMessages = [
    {
      role: 'assistant',
      parts: [
        {
          type: 'tool-streamingTool',
          toolCallId: 'tool-call-1',
          state: 'output-available',
          input: { task: 'finish the work' },
          output: { complete: false, progress: 'half finished' },
          preliminary: true,
        },
      ],
    },
    {
      role: 'user',
      parts: [{ type: 'text', text: 'Continue after the interrupted stream.' }],
    },
  ] satisfies Array<Omit<UIMessage, 'id'>>;

  const modelMessages = await convertToModelMessages(persistedMessages, {
    ignoreIncompleteToolCalls: true,
    tools: { streamingTool },
  });

  const serializedModelMessages = JSON.stringify(modelMessages);

  console.log(
    JSON.stringify(
      {
        expected:
          'The preliminary tool part is omitted, toModelOutput is not called, and only the subsequent user message remains.',
        toModelOutputCalls,
        modelMessages,
      },
      null,
      2,
    ),
  );

  assert.equal(
    serializedModelMessages.includes(leakedOutputMarker),
    false,
    failureSignal,
  );
  assert.equal(toModelOutputCalls, 0, failureSignal);
  assert.deepEqual(modelMessages, [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Continue after the interrupted stream.' },
      ],
    },
  ]);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
