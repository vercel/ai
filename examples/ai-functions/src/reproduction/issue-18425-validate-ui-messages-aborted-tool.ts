import {
  type InferUITools,
  tool,
  type UIMessage,
  validateUIMessages,
} from '../../../../packages/ai/dist/index.mjs';
import { z } from '../../../../node_modules/.pnpm/zod@4.1.13/node_modules/zod/index.js';

const tools = {
  create_artifact: tool({
    description: 'Demo tool with required fields',
    // The release-v5.0 declarations resolve their local Zod 3 installation,
    // while the runtime peer contract also accepts this installed Zod 4 schema.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inputSchema: z.object({
      identifier: z.string(),
      type: z.enum(['application/vnd.react', 'text/html']),
      language: z.string(),
      code: z.string(),
    }) as any,
    execute: async () => 'ok',
  }),
};

type ChatMessage = UIMessage<
  unknown,
  Record<string, never>,
  InferUITools<typeof tools>
>;

const initialUserMessage: ChatMessage = {
  id: 'u1',
  role: 'user',
  parts: [{ type: 'text', text: 'make me a chart' }],
};

const abortedToolMessage: ChatMessage = {
  id: 'a1',
  role: 'assistant',
  parts: [
    { type: 'step-start' },
    {
      type: 'tool-create_artifact',
      toolCallId: 'toolu_demo_aborted',
      state: 'output-available',
      input: {},
      output: '{"error":"Tool was aborted by the user."}',
    } as any,
  ],
};

const outputErrorControlMessage: ChatMessage = {
  id: 'a1',
  role: 'assistant',
  parts: [
    { type: 'step-start' },
    {
      type: 'tool-create_artifact',
      toolCallId: 'toolu_demo_aborted',
      state: 'output-error',
      input: {},
      errorText: 'Tool was aborted by the user.',
    } as any,
  ],
};

async function getValidationError(messages: ChatMessage[]) {
  try {
    await validateUIMessages<ChatMessage>({ messages, tools });
    return undefined;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

async function main() {
  const followUps = ['are you working?', 'please continue'];
  const errors = [];

  for (const [index, text] of followUps.entries()) {
    const error = await getValidationError([
      initialUserMessage,
      abortedToolMessage,
      {
        id: `u${index + 2}`,
        role: 'user',
        parts: [{ type: 'text', text }],
      },
    ]);

    if (!error) {
      throw new Error(
        'ISSUE_18425_NOT_REPRODUCED: terminal output-available history was accepted',
      );
    }

    errors.push(error);
    console.error(`follow-up ${index + 1}: ${error.name}: ${error.message}`);
  }

  if (
    errors.some(
      error =>
        error.name !== 'AI_TypeValidationError' ||
        !error.message.includes('Value: {}'),
    )
  ) {
    throw new Error(
      'REPRODUCTION_HARNESS_MISMATCH: validation failed for an unexpected reason',
    );
  }

  const controlError = await getValidationError([
    initialUserMessage,
    outputErrorControlMessage,
    {
      id: 'u2',
      role: 'user',
      parts: [{ type: 'text', text: followUps[0] }],
    },
  ]);

  console.log(
    controlError
      ? 'release-v5.0 control: output-error input is also re-validated'
      : 'release-v5.0 control: output-error input is skipped',
  );

  throw new Error(
    'ISSUE_18425_REPRODUCED: terminal output-available history rejected on every follow-up',
  );
}

void main();
