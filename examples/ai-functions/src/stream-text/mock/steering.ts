import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { experimental_createSteering, isStepCount, streamText, tool } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';
import { run } from '../../lib/run';

const usage = {
  inputTokens: {
    total: 3,
    noCache: 3,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
};

run(async () => {
  const steering = experimental_createSteering();
  let call = 0;

  const result = streamText({
    model: new MockLanguageModelV3({
      doStream: async () => ({
        stream: convertArrayToReadableStream<LanguageModelV3StreamPart>(
          call++ === 0
            ? [
                {
                  type: 'tool-call',
                  toolCallId: 'call-1',
                  toolName: 'weather',
                  input: '{ "city": "Paris" }',
                },
                {
                  type: 'finish',
                  finishReason: { raw: undefined, unified: 'tool-calls' },
                  usage,
                },
              ]
            : [
                { type: 'text-start', id: '0' },
                {
                  type: 'text-delta',
                  id: '0',
                  delta: 'It is sunny in Paris, Texas.',
                },
                { type: 'text-end', id: '0' },
                {
                  type: 'finish',
                  finishReason: { raw: undefined, unified: 'stop' },
                  usage,
                },
              ],
        ),
      }),
    }),
    prompt: 'What is the weather in Paris?',
    tools: {
      weather: tool({
        inputSchema: z.object({ city: z.string() }),
        execute: async ({ city }) => {
          // the user sends a correction while the tool is running:
          void steering
            .steer('I meant Paris, Texas.')
            .then(outcome => console.log('steering outcome:', outcome));

          return `sunny in ${city}`;
        },
      }),
    },
    stopWhen: isStepCount(5),
    experimental_steering: steering,
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();

  for (const step of await result.steps) {
    console.log(
      `step ${step.stepNumber} steering messages:`,
      step.experimental_steeringMessages,
    );
  }
});
