import { openai } from '@ai-sdk/openai';
import { createAgentUIStream, tool, ToolLoopAgent } from 'ai';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { run } from '../../lib/run';

const agent = new ToolLoopAgent({
  model: openai('gpt-5.6'),
  instructions: 'Use the weather tool, then answer the user.',
  tools: {
    weather: tool({
      description: 'Get the current weather for a location.',
      inputSchema: z.object({ location: z.string() }),
      execute: async ({ location }) => ({
        location,
        temperature: 72,
        condition: 'sunny',
      }),
    }),
  },
  prepareStep: ({ stepNumber }) => ({
    toolChoice:
      stepNumber === 0 ? { type: 'tool', toolName: 'weather' } : 'none',
  }),
});

run(async () => {
  const persistedSnapshots: unknown[] = [];

  const stream = await createAgentUIStream({
    agent,
    uiMessages: [
      {
        id: 'user-1',
        role: 'user',
        parts: [
          { type: 'text', text: 'What is the weather in San Francisco?' },
        ],
      },
    ],
    generateMessageId: () => 'assistant-1',
    onUIMessageStepEnd: async ({ responseMessage }) => {
      // Replace this with an idempotent database upsert in production.
      persistedSnapshots.push(responseMessage);
      console.log(
        `\nPersisting step ${persistedSnapshots.length}:`,
        JSON.stringify(responseMessage, null, 2),
      );
    },
  });

  for await (const chunk of stream) {
    if (chunk.type === 'text-delta') {
      process.stdout.write(chunk.delta);
    }
  }

  assert.equal(persistedSnapshots.length, 2);
  console.log('\nPersisted both agent steps.');
});
