import { anthropic } from '@ai-sdk/anthropic';
import {
  convertToModelMessages,
  isStepCount,
  readUIMessageStream,
  ToolLoopAgent,
  tool,
  type UIMessage,
} from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

run(async () => {
  // A large notebook makes cache reuse visible in the token counts.
  const notes = Array.from(
    { length: 320 },
    (_, i) =>
      `Note ${i}: Plant lavender, rosemary, thyme, mint, sage, basil, parsley and chives in the garden.`,
  );
  const agent = new ToolLoopAgent({
    model: anthropic('claude-sonnet-5-5'),
    stopWhen: isStepCount(5),
    providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
    tools: {
      toolSearch: anthropic.tools.toolSearchBm25_20251119(),
      readNotes: tool({
        description: 'Read the notes in a notebook',
        inputSchema: z.object({}),
        execute: async () => notes.join('\n'),
      }),
      addNote: tool({
        description: 'Add a note to the notebook',
        inputSchema: z.object({ text: z.string() }),
        execute: async ({ text }) => {
          notes.push(text);
          return { saved: text };
        },
        providerOptions: { anthropic: { deferLoading: true } },
      }),
    },
    onStepFinish: step =>
      console.log('\nCache tokens:', {
        read: step.usage.inputTokenDetails.cacheReadTokens,
        written: step.usage.inputTokenDetails.cacheWriteTokens,
      }),
  });
  const messages: UIMessage[] = [
    {
      id: 'read-notes',
      role: 'user',
      parts: [
        {
          type: 'text',
          text: 'Read my notes and search for addNote in parallel. Then add a note about watering the garden. Keep your reply brief.',
        },
      ],
    },
  ];
  const firstTurn = await agent.stream({
    messages: await convertToModelMessages(messages),
  });
  // Tool search can finish in a later step. UI messages keep its call and result
  // together; Anthropic provider metadata preserves the original result position.
  for await (const message of readUIMessageStream({
    stream: firstTurn.toUIMessageStream(),
  })) {
    messages[1] = message;
  }
  console.log('First turn:', await firstTurn.text);

  // Saving complete UI messages keeps the provider metadata needed on replay.
  const savedMessages: UIMessage[] = JSON.parse(JSON.stringify(messages));
  savedMessages.push({
    id: 'follow-up',
    role: 'user',
    parts: [
      {
        type: 'text',
        text: 'What note did you add? Answer briefly without calling any tools.',
      },
    ],
  });
  const secondTurn = await agent.stream({
    messages: await convertToModelMessages(savedMessages),
  });
  for await (const text of secondTurn.textStream) process.stdout.write(text);
  console.log();
});
