import { createMistral } from '@ai-sdk/mistral';
import { generateText, streamText, tool } from 'ai';
import { z } from 'zod';
import { print } from '../lib/print';
import { run } from '../lib/run';

run(async () => {
  const toolCall = {
    id: 'weather01',
    type: 'function',
    function: { name: 'weather', arguments: { location: 'San Francisco' } },
  };
  const usage = { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 };
  const provider = createMistral({
    apiKey: 'test-api-key',
    fetch: async (_url, init) => {
      if (JSON.parse(String(init?.body)).stream) {
        const chunks = [
          { choices: [{ index: 0, delta: { tool_calls: [toolCall] } }] },
          {
            choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
            usage,
          },
        ];
        return new Response(
          chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') +
            'data: [DONE]\n\n',
          { headers: { 'content-type': 'text/event-stream' } },
        );
      }
      return Response.json({
        object: 'chat.completion',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', tool_calls: [toolCall] },
            finish_reason: 'tool_calls',
          },
        ],
        usage,
      });
    },
  });
  const options = {
    model: provider.chat('mistral-small-latest'),
    prompt: 'What is the weather in San Francisco?',
    maxRetries: 0,
    tools: {
      weather: tool({
        inputSchema: z.object({ location: z.string() }),
        execute: async ({ location }) => `Sunny in ${location}`,
      }),
    },
  };

  try {
    const result = await generateText(options);
    print('generateText tool results:', result.toolResults);
  } catch (error) {
    print('generateText error:', error);
  }

  for await (const part of streamText(options).fullStream) {
    if (part.type === 'tool-result' || part.type === 'error') {
      print('streamText:', part);
    }
  }
});
