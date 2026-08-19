import {
  convertToModelMessages,
  tool,
  type InferUITools,
  type UIMessage,
} from 'ai';
import { z } from 'zod';

const failureSignal =
  'ISSUE_19080_REPRODUCED: preliminary tool output was converted into a model-facing tool result';

async function main() {
  let toModelOutputCalls = 0;

  const tools = {
    progress: tool({
      inputSchema: z.object({ task: z.string() }),
      async *execute({ task }) {
        yield { phase: 'working' as const, message: `Working on ${task}` };
        yield { phase: 'complete' as const, result: `${task} complete` };
      },
      toModelOutput: ({ output }) => {
        toModelOutputCalls++;
        return {
          type: 'text',
          value: `converted:${JSON.stringify(output)}`,
        };
      },
    }),
  };

  type Message = Omit<
    UIMessage<unknown, never, InferUITools<typeof tools>>,
    'id'
  >;

  const messages: Message[] = [
    {
      role: 'assistant',
      parts: [
        {
          type: 'tool-progress',
          state: 'output-available',
          toolCallId: 'call-1',
          input: { task: 'report' },
          output: {
            phase: 'working',
            message: 'Working on report',
          },
          preliminary: true,
        },
      ],
    },
    {
      role: 'user',
      parts: [{ type: 'text', text: 'Continue.' }],
    },
  ];

  const result = await convertToModelMessages(messages, {
    ignoreIncompleteToolCalls: true,
    tools,
  });

  const expected = [
    {
      role: 'user',
      content: [{ type: 'text', text: 'Continue.' }],
    },
  ];

  if (
    toModelOutputCalls === 0 &&
    JSON.stringify(result) === JSON.stringify(expected)
  ) {
    return;
  }

  const preliminaryOutputWasForwarded =
    toModelOutputCalls === 1 &&
    result.some(
      message =>
        message.role === 'tool' &&
        message.content.some(
          part =>
            part.type === 'tool-result' &&
            part.output.type === 'text' &&
            part.output.value.includes('"phase":"working"'),
        ),
    );

  if (preliminaryOutputWasForwarded) {
    throw new Error(failureSignal);
  }

  throw new Error(
    `Unexpected conversion result: calls=${toModelOutputCalls} result=${JSON.stringify(result)}`,
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
