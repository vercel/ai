import {
  type InferUITool,
  type UIMessage,
  safeValidateUIMessages,
  tool,
} from 'ai';
import { z } from 'zod/v4';

const currentTools = {
  X: tool({
    inputSchema: z.object({
      bar: z.object({
        value: z.number(),
      }),
    }),
  }),
};

type MyUIMessage = UIMessage<
  never,
  never,
  {
    X: InferUITool<(typeof currentTools)['X']>;
  }
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
        output: 'completed under the old schema',
      },
    ],
  },
];

async function main() {
  // The application validates each persisted message separately so an
  // incompatible historical message can be replaced with a tombstone.
  const validation = await safeValidateUIMessages<MyUIMessage>({
    messages: persistedMessages,
    tools: currentTools,
  });

  if (!validation.success) {
    console.log(
      'Issue not reproduced: the stale persisted tool input was rejected.',
    );
    return;
  }

  const toolPart = validation.data[0].parts.find(
    part => part.type === 'tool-X',
  );

  if (toolPart?.type !== 'tool-X' || toolPart.state !== 'output-available') {
    throw new Error(
      'Reproduction setup failed: output-available tool-X part was not preserved',
    );
  }

  try {
    // TypeScript accepts this access because successful validation claims that
    // the persisted value conforms to MyUIMessage and the current tool schema.
    console.log(toolPart.input.bar.value);
  } catch (cause) {
    throw new Error(
      'ISSUE_19358_REPRODUCED: safeValidateUIMessages accepted stale tool input and typed access to input.bar.value crashed',
      { cause },
    );
  }
}

await main();
