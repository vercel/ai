import {
  type InferUITools,
  tool,
  type UIMessage,
  validateUIMessages,
} from 'ai';
import { z } from '../../../../apps/docs/node_modules/zod/index.js';

const tools = {
  create_artifact: tool({
    description: 'Demo tool with required fields',
    inputSchema: z.object({
      identifier: z.string(),
      type: z.enum(['application/vnd.react', 'text/html']),
      language: z.string(),
      code: z.string(),
    }),
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
      console.log(
        'Issue #18425 did not reproduce: terminal output-available history was accepted.',
      );
      return;
    }

    errors.push(error);
    console.error(error.message);
  }

  const expectedPath =
    'messages[1].parts[1].input (create_artifact, id: "toolu_demo_aborted")';

  if (
    errors.some(
      error =>
        error.name !== 'AI_TypeValidationError' ||
        !error.message.includes(expectedPath) ||
        !error.message.includes('Value: {}'),
    )
  ) {
    throw new Error(
      'Reproduction harness mismatch: validation failed for an unexpected reason.',
    );
  }

  await validateUIMessages<ChatMessage>({
    messages: [
      initialUserMessage,
      outputErrorControlMessage,
      {
        id: 'u2',
        role: 'user',
        parts: [{ type: 'text', text: followUps[0] }],
      },
    ],
    tools,
  });

  throw new Error(
    'ISSUE_18425_REPRODUCED: terminal output-available history rejected on every follow-up while output-error control passed',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
