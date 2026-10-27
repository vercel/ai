import { openai } from '@ai-sdk/openai';
import {
  compactMessages,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  isStepCount,
  tool,
  ToolLoopAgent,
  toUIMessageStream,
} from 'ai';
import * as z from 'zod/v4';
import type { CompactionChatMessage, ConversationState } from './types';

export async function POST(req: Request) {
  const {
    message,
    context,
  }: {
    message: CompactionChatMessage;
    context: ConversationState;
  } = await req.json();

  if (message?.role !== 'user') {
    return new Response('Expected a new user message.', { status: 400 });
  }

  const log = (event: string, data: unknown) => {
    console.log(`\n[chat:${message.id}] ${event}`);
    console.dir(data, { depth: null });
  };

  // The visible transcript stays in useChat. Only this working context goes to the model.
  let history = [
    ...context.messages,
    ...(await convertToModelMessages([message])),
  ];
  let checkpoint = context.checkpoint;
  const model = openai('gpt-6.1-terra');
  const tools = {
    getTime: tool({
      description: 'Get the current UTC date and time.',
      inputSchema: z.object({}),
      execute: async () => new Date().toISOString(),
    }),
  };

  const stream = createUIMessageStream<CompactionChatMessage>({
    execute: async ({ writer }) => {
      let failed = false;
      const agent = new ToolLoopAgent({
        model,
        instructions:
          'You are a helpful assistant. Remember the details the user shares. Keep replies to two or three sentences. Use getTime when asked for the current time.',
        tools,
        reasoning: 'low',
        maxOutputTokens: 1_024,
        stopWhen: isStepCount(5),
        prepareStep: async ({ messages, stepNumber }) => {
          history = [...messages];
          log(`Step ${stepNumber}: message history`, messages);
          // A small message-count threshold makes compaction easy to see as you chat.
          if (messages.length < 8) return;

          const eventId = `compaction-${stepNumber}`;
          log('Compaction starting', {
            messageCount: messages.length,
            reason: 'The model context reached the 8-message demo threshold.',
          });
          writer.write({
            type: 'data-compaction',
            id: eventId,
            data: { status: 'running', beforeMessages: messages.length },
          });

          const compacted = await compactMessages({
            strategy: 'summarize',
            messages,
            checkpoint,
            keepRecentMessages: 2,
            // Allow earlier completed tool exchanges in this turn to be summarized.
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
          history = compacted.messages;
          checkpoint = compacted.checkpoint;
          log(
            compacted.compacted
              ? 'Compaction complete: new history'
              : 'Compaction skipped: history unchanged',
            {
              compacted: compacted.compacted,
              messages: history,
              checkpoint,
            },
          );
          writer.write({
            type: 'data-compaction',
            id: eventId,
            data: {
              status: compacted.compacted ? 'complete' : 'skipped',
              beforeMessages: messages.length,
              afterMessages: history.length,
            },
          });
          return { messages: history };
        },
        onStepEnd: ({ response, toolCalls, toolResults, stepNumber }) => {
          if (toolCalls.length > 0) {
            log(`Step ${stepNumber}: tool calls and results`, {
              toolCalls,
              toolResults,
            });
          }
          // Append only this step, never the run's aggregate responseMessages.
          history = [...history, ...response.messages];
        },
        onError: ({ error }) => {
          failed = true;
          log('Turn failed', error);
        },
        onEnd: ({ finishReason }) => {
          if (failed || req.signal.aborted || finishReason === 'error') return;
          log('Turn complete: saved history', {
            messages: history,
            checkpoint,
          });
          // Commit history and checkpoint together only after a successful turn.
          writer.write({
            type: 'data-context',
            data: { messages: history, checkpoint },
            transient: true,
          });
        },
      });

      const result = await agent.stream({
        messages: history,
        abortSignal: req.signal,
      });
      writer.merge(toUIMessageStream({ stream: result.stream }));
    },
  });

  return createUIMessageStreamResponse({ stream });
}
