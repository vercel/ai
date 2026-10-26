import { openai } from '@ai-sdk/openai';
import {
  compactMessages,
  generateText,
  measureContext,
  tool,
  ToolLoopAgent,
  type CompactionCheckpoint,
  type ModelMessage,
} from 'ai';
import { createInterface } from 'node:readline/promises';
import * as z from 'zod/v4';
import { run } from '../lib/run';

run(async () => {
  const model = openai('gpt-6.1-terra');
  const tools = {
    getTime: tool({
      description: 'Get the current time in UTC.',
      inputSchema: z.object({}),
      execute: async () => new Date().toISOString(),
    }),
  };
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const controller = new AbortController();
  const abortSignal = controller.signal;
  terminal.on('SIGINT', () => {
    controller.abort();
    terminal.close();
  });
  let history: ModelMessage[] = [];
  let checkpoint: CompactionCheckpoint | undefined;

  console.log(
    'Chat with the agent. Compaction starts at 8 messages. /exit to quit.',
  );
  try {
    while (!abortSignal.aborted) {
      const prompt = await terminal.question('\nYou: ', {
        signal: abortSignal,
      });
      if (prompt.trim() === '/exit') break;
      if (!prompt.trim()) continue;

      let workingHistory: ModelMessage[] = [
        ...history,
        { role: 'user', content: prompt },
      ];
      let workingCheckpoint = checkpoint;
      let failed = false;
      let streamError: unknown;
      const agent = new ToolLoopAgent({
        model,
        instructions:
          'Be a helpful, concise assistant. Remember the conversation.',
        tools,
        reasoning: 'low',
        maxOutputTokens: 1_024,
        prepareStep: async ({ model, instructions, messages, stepNumber }) => {
          workingHistory = [...messages];
          console.log(`\n[Step ${stepNumber + 1}: message history]`);
          console.dir(messages, { depth: null });
          // A small message-count threshold makes compaction easy to see as you chat.
          if (messages.length < 8) return;

          console.log(`\n[Step ${stepNumber + 1}: compacting conversation...]`);
          const context = await measureContext({
            model,
            instructions,
            tools,
            messages,
          });
          const compacted = await compactMessages({
            messages,
            context,
            checkpoint: workingCheckpoint,
            targetInputTokens:
              context.fixedInputTokens +
              Math.ceil((context.inputTokens - context.fixedInputTokens) / 2),
            keepRecentMessages: 2,
            abortSignal,
            summarize: {
              maxInputTokens: 6_000,
              maxOutputTokens: 1_024,
              execute: ({ system, messages, maxOutputTokens, abortSignal }) =>
                generateText({
                  model,
                  instructions: system,
                  reasoning: 'low',
                  messages,
                  maxOutputTokens,
                  abortSignal,
                }),
            },
          });
          workingHistory = compacted.messages;
          workingCheckpoint = compacted.checkpoint;
          console.log(
            `[Compacted ${messages.length} → ${compacted.messages.length} messages; ` +
              `${compacted.inputTokensBefore} → ${compacted.inputTokensAfter} estimated input tokens]`,
          );
          console.log('[New message history and checkpoint]');
          console.dir(
            { messages: workingHistory, checkpoint: workingCheckpoint },
            { depth: null },
          );
          return { messages: compacted.messages };
        },
        onStepEnd: ({ response, toolCalls, toolResults }) => {
          if (toolCalls.length > 0) {
            console.log('\n[Tool calls]');
            console.dir(toolCalls, { depth: null });
          }
          if (toolResults.length > 0) {
            console.log('[Tool results]');
            console.dir(toolResults, { depth: null });
          }
          // Append each step once; aggregate responseMessages would restore old steps.
          workingHistory = [...workingHistory, ...response.messages];
        },
        onError: ({ error }) => {
          failed = true;
          streamError = error;
        },
      });

      try {
        const result = await agent.stream({
          messages: workingHistory,
          abortSignal,
        });
        process.stdout.write('Assistant: ');
        for await (const chunk of result.textStream)
          process.stdout.write(chunk);
        await result.responseMessages;
        if (failed) throw streamError;
        abortSignal.throwIfAborted();

        // Commit only after the entire turn succeeds, including every tool step.
        history = workingHistory;
        checkpoint = workingCheckpoint;
        console.log('\n[Saved message history]');
        console.dir(history, { depth: null });
      } catch (error) {
        if (abortSignal.aborted) break;
        console.error('\nTurn failed; conversation was not saved.', error);
      }
    }
  } finally {
    terminal.close();
  }
});
