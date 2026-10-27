import { openai } from '@ai-sdk/openai';
import {
  compactMessages,
  createAgentUIStreamResponse,
  generateText,
  isStepCount,
  tool,
  ToolLoopAgent,
} from 'ai';
import * as z from 'zod/v4';

export async function POST(req: Request) {
  const { messages } = await req.json();
  const model = openai('gpt-6.1-terra');
  const agent = new ToolLoopAgent({
    model,
    instructions:
      'You are a helpful assistant. Remember the details the user shares. Keep replies to two or three sentences. Use getTime when asked for the current time.',
    tools: {
      getTime: tool({
        description: 'Get the current UTC date and time.',
        inputSchema: z.object({}),
        execute: async () => new Date().toISOString(),
      }),
    },
    reasoning: 'low',
    maxOutputTokens: 1_024,
    stopWhen: isStepCount(5),
    prepareStep: async ({ messages, compactionCheckpoint, stepNumber }) => {
      console.log(`Step ${stepNumber}: ${messages.length} model messages`);
      // A small threshold makes compaction easy to see, including between tool steps.
      if (messages.length < 8) return;

      const compaction = await compactMessages({
        strategy: 'summarize',
        messages,
        checkpoint: compactionCheckpoint,
        keepRecentMessages: 2,
        keepCurrentTurn: false,
        summarize: {
          maxOutputTokens: 4_096,
          execute: ({ system, ...input }) =>
            generateText({
              model,
              instructions: system,
              reasoning: 'low',
              ...input,
            }),
        },
        abortSignal: req.signal,
      });
      console.log('Compaction result:', compaction);
      return { compaction };
    },
    onError: ({ error }) => console.error('Turn failed:', error),
  });

  // The SDK restores context/checkpoints and records later compactions in this
  // same UI history. The client uses the ordinary full-history chat transport.
  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
    abortSignal: req.signal,
  });
}
