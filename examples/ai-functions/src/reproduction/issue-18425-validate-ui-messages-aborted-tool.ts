import assert from 'node:assert/strict';
import {
  type InferUITools,
  tool,
  type UIMessage,
  validateUIMessages,
} from 'ai';
import { z } from 'zod';

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

type Message = UIMessage<never, never, InferUITools<typeof tools>>;

const abortedToolPart = {
  type: 'tool-create_artifact',
  toolCallId: 'toolu_demo_aborted',
  state: 'output-available',
  input: {},
  output: '{"error":"Tool was aborted by the user."}',
} as const;

const conversationBeforeFollowUp: Message[] = [
  {
    id: 'u1',
    role: 'user',
    parts: [{ type: 'text', text: 'make me a chart' }],
  },
  {
    id: 'a1',
    role: 'assistant',
    parts: [{ type: 'step-start' }, abortedToolPart as any],
  },
];

async function main() {
  const outputErrorControl: Message[] = [
    conversationBeforeFollowUp[0],
    {
      id: 'a1',
      role: 'assistant',
      parts: [
        { type: 'step-start' },
        {
          type: 'tool-create_artifact',
          toolCallId: abortedToolPart.toolCallId,
          state: 'output-error',
          input: {},
          errorText: 'Tool was aborted by the user.',
        } as any,
      ],
    },
  ];

  await validateUIMessages<Message>({ messages: outputErrorControl, tools });

  const followUps = [
    { id: 'u2', text: 'are you working?' },
    { id: 'u3', text: 'please try something else' },
  ];
  const rejectedFollowUps: string[] = [];

  for (const followUp of followUps) {
    try {
      await validateUIMessages<Message>({
        messages: [
          ...conversationBeforeFollowUp,
          {
            id: followUp.id,
            role: 'user',
            parts: [{ type: 'text', text: followUp.text }],
          },
        ],
        tools,
      });
    } catch (error) {
      assert.ok(
        error instanceof Error &&
          error.message.includes(
            'messages[1].parts[1].input (create_artifact, id: "toolu_demo_aborted")',
          ),
        `Unexpected validation error: ${String(error)}`,
      );
      rejectedFollowUps.push(followUp.id);
    }
  }

  assert.equal(
    rejectedFollowUps.length,
    0,
    'ISSUE_18425_REPRODUCED: terminal output-available aborted tool history rejected every follow-up message',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
