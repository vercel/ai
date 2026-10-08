import { isStepCount, streamText, tool } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod/v4';
import { run } from '../../lib/run';

run(async () => {
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'weather',
          input: '{}',
        },
        {
          type: 'finish',
          finishReason: { unified: 'tool-calls', raw: undefined },
          usage: {
            inputTokens: {
              total: 1,
              noCache: 1,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: { total: 1, text: 1, reasoning: undefined },
          },
        },
      ]),
    }),
  });

  for (const explicitLimit of [false, true]) {
    console.log(explicitLimit ? 'Explicit step limit:' : 'Default step limit:');

    const result = streamText({
      model,
      tools: {
        weather: tool({
          inputSchema: z.object({}),
          execute: async () => ({ temperature: 72, conditions: 'sunny' }),
        }),
      },
      prompt: 'What is the weather?',
      // Omitting stopWhen warns because the default limit prevents the model
      // from using the tool result. An explicit limit does not warn.
      stopWhen: explicitLimit ? isStepCount(1) : undefined,
    });

    await result.consumeStream();
    console.log('Steps:', (await result.steps).length);
    console.log('Tool results:', await result.toolResults);
  }
});
