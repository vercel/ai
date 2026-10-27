import { openai } from '@ai-sdk/openai';
import {
  compactMessages,
  convertToModelMessages,
  createAgentUIStreamResponse,
  generateText,
  isStepCount,
  tool,
  ToolLoopAgent,
} from 'ai';
import * as z from 'zod/v4';

function log(label: string, value: unknown) {
  console.log(`\n[compaction] ${label}`);
  console.dir(value, { depth: null });
}

export async function POST(req: Request) {
  const { messages } = await req.json();
  log('Incoming UI history', messages);
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
      log(`Step ${stepNumber}: model history (${messages.length} messages)`, {
        messages,
        checkpoint: compactionCheckpoint,
      });
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
      log(`Step ${stepNumber}: compaction`, {
        compacted: compaction.compacted,
        checkpoint: compaction.checkpoint,
      });
      log(
        `Step ${stepNumber}: model history after compaction`,
        compaction.messages,
      );
      return { compaction };
    },
    onStepEnd: ({ stepNumber, toolCalls, toolResults }) => {
      if (toolCalls.length > 0) {
        log(`Step ${stepNumber}: tools`, { toolCalls, toolResults });
      }
    },
    onError: ({ error }) => console.error('Turn failed:', error),
  });

  // The SDK restores context/checkpoints and records later compactions in this
  // same UI history. The client uses the ordinary full-history chat transport.
  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
    abortSignal: req.signal,
    onEnd: async ({ messages, responseMessage }) => {
      const compactionParts = responseMessage.parts.filter(
        part => part.type === 'compaction',
      );
      if (compactionParts.length > 0) {
        log('UI compaction parts', compactionParts);
      }
      log('Final UI history', messages);
      try {
        log(
          'Final model history restored from UI',
          await convertToModelMessages(messages, { tools: agent.tools }),
        );
      } catch (error) {
        console.error(
          '[compaction] Could not log restored model history:',
          error,
        );
      }
    },
  });
}
