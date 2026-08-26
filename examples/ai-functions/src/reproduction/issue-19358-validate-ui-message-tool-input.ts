import { tool } from '../../../../packages/provider-utils/src/types/tool.ts';
import type {
  InferUITool,
  UIMessage,
} from '../../../../packages/ai/src/ui/ui-messages.ts';
import { safeValidateUIMessages } from '../../../../packages/ai/src/ui/validate-ui-messages.ts';
import { z } from '../../../../packages/ai/node_modules/zod/v4/index.js';

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
  // Validate each historical message independently, as in the reported
  // persistence flow, so invalid history can be replaced with a tombstone.
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
    // TypeScript accepts this because successful validation returns
    // MyUIMessage, whose current tool schema requires input.bar.value.
    console.log(toolPart.input.bar.value);
  } catch (cause) {
    throw new Error(
      'ISSUE_19358_REPRODUCED: safeValidateUIMessages accepted stale tool input and typed access to input.bar.value crashed',
      { cause },
    );
  }
}

await main();
