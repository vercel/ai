import { createCohere } from '@ai-sdk/cohere';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { print } from '../lib/print';
import { run } from '../lib/run';

run(async () => {
  const events = [
    {
      type: 'tool-call-start',
      index: 0,
      delta: {
        message: {
          tool_calls: {
            id: 'current-time',
            type: 'function',
            function: { name: 'currentTime', arguments: '' },
          },
        },
      },
    },
    {
      type: 'tool-call-delta',
      index: 0,
      delta: {
        message: { tool_calls: { function: { arguments: 'null' } } },
      },
    },
    { type: 'tool-call-end', index: 0 },
    {
      type: 'message-end',
      delta: {
        finish_reason: 'TOOL_CALL',
        usage: {
          billed_units: { input_tokens: 0, output_tokens: 0 },
          tokens: { input_tokens: 0, output_tokens: 0 },
        },
      },
    },
  ];
  const cohere = createCohere({
    apiKey: 'test-api-key',
    fetch: async () =>
      new Response(
        events
          .map(
            event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
          )
          .join(''),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
  });
  const result = streamText({
    model: cohere('command-r-plus'),
    prompt: 'What is the current time?',
    tools: {
      currentTime: tool({
        inputSchema: z.object({}),
        execute: async () => '12:00',
      }),
    },
  });

  for await (const part of result.fullStream) {
    if (part.type === 'tool-error' || part.type === 'tool-result') {
      print(part.type, part);
    }
  }
});
