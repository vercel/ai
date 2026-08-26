import { type InferUITool, type UIMessage, safeValidateUIMessages } from 'ai';
import { z } from 'zod';

const currentTool = {
  name: 'X',
  inputSchema: z.object({
    bar: z.object({
      value: z.number(),
    }),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
};

type MyUIMessage = UIMessage<
  never,
  never,
  { X: InferUITool<typeof currentTool> }
>;

const persistedMessages: unknown = [
  {
    id: 'historical-assistant-message',
    role: 'assistant',
    parts: [
      {
        type: 'tool-X',
        toolCallId: 'historical-tool-call',
        state: 'output-available',
        input: {
          foo: {
            value: 42,
          },
        },
        output: {
          result: 'success',
        },
      },
    ],
  },
];

async function main() {
  const validation = await safeValidateUIMessages<MyUIMessage>({
    messages: persistedMessages,
    tools: {
      X: currentTool,
    },
  });

  // A fixed implementation rejects the stale persisted input, allowing the
  // application to replace this historical message with a tombstone.
  if (!validation.success) {
    return;
  }

  const toolPart = validation.data[0]?.parts.find(
    part => part.type === 'tool-X' && part.state === 'output-available',
  );

  if (
    toolPart == null ||
    toolPart.type !== 'tool-X' ||
    toolPart.state !== 'output-available'
  ) {
    throw new Error(
      'Reproduction setup failed to locate the validated tool part',
    );
  }

  let runtimeError: unknown;

  try {
    // This access is valid according to MyUIMessage, but the stale persisted
    // input accepted above still has { foo } instead of the current { bar }.
    void toolPart.input.bar.value;
  } catch (error) {
    runtimeError = error;
  }

  if (!(runtimeError instanceof TypeError)) {
    throw new Error(
      'Reproduction setup failed: accepted stale input did not cause the expected runtime TypeError',
    );
  }

  console.error(
    'ISSUE #19358 REPRODUCED: stale output-available tool input passed validation and caused a runtime access failure',
  );
  process.exitCode = 1;
}

main();
