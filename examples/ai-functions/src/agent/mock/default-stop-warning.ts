import { isStepCount, ToolLoopAgent, tool } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod/v4';
import { run } from '../../lib/run';

run(async () => {
  let callCount = 0;
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        {
          type: 'tool-call',
          toolCallId: `call-${++callCount}`,
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

    const agent = new ToolLoopAgent({
      model,
      tools: {
        weather: tool({
          inputSchema: z.object({}),
          execute: async () => ({ temperature: 72, conditions: 'sunny' }),
        }),
      },
      // Omitting stopWhen warns because the default limit prevents the model
      // from continuing after 20 steps. An explicit limit does not warn.
      stopWhen: explicitLimit ? isStepCount(20) : undefined,
    });

    const result = await agent.stream({ prompt: 'What is the weather?' });
    await result.consumeStream();
    console.log('Steps:', (await result.steps).length);
    console.log('Tool results:', (await result.toolResults).length);
  }
});
