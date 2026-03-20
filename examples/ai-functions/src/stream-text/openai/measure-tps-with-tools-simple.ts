import { performance } from 'node:perf_hooks';
import { openai } from '@ai-sdk/openai';
import { stepCountIs, streamText, tool, type TelemetryIntegration } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const tokPerSecond = (tokens: number | undefined, ms: number) =>
  tokens == null || ms <= 0
    ? 'n/a'
    : `${((tokens * 1000) / ms).toFixed(1)} tok/s`;

run(async () => {
  const meter = {
    startedAt: 0,
    firstTextAt: undefined as number | undefined,
    msToFirstChunk: undefined as number | undefined,
    toolMs: 0,
  };

  const telemetry: TelemetryIntegration = {
    onChunk({ chunk }) {
      if (chunk.type !== 'ai.stream.firstChunk') {
        return;
      }

      const msToFirstChunk = chunk.attributes?.['ai.response.msToFirstChunk'];

      if (typeof msToFirstChunk === 'number') {
        meter.msToFirstChunk ??= msToFirstChunk;
      }
    },
  };

  const result = streamText({
    model: openai('gpt-4o-mini'),
    prompt:
      'Find my current location, get the weather there, and answer in one sentence.',
    stopWhen: stepCountIs(5),
    tools: {
      currentLocation: tool({
        description: 'Get the current location.',
        inputSchema: z.object({}),
        execute: async () => {
          await wait(200);
          return { location: 'San Francisco' };
        },
      }),
      weather: tool({
        description: 'Get the weather in a location.',
        inputSchema: z.object({ location: z.string() }),
        execute: async ({ location }) => {
          await wait(600);
          return { location, temperature: 63, condition: 'foggy' };
        },
      }),
    },
    experimental_telemetry: {
      isEnabled: true,
      integrations: telemetry,
    },
    experimental_onStart() {
      meter.startedAt = performance.now();
    },
    onChunk({ chunk }) {
      if (chunk.type === 'text-delta') {
        meter.firstTextAt ??= performance.now();
      }
    },
    experimental_onToolCallFinish({ durationMs }) {
      meter.toolMs += durationMs;
    },
    onFinish({ totalUsage }) {
      const finishedAt = performance.now();
      const totalMs = finishedAt - meter.startedAt;
      const visibleTextMs =
        meter.firstTextAt == null ? totalMs : finishedAt - meter.firstTextAt;
      const modelOnlyMs = Math.max(totalMs - meter.toolMs, 0);

      console.log('\n\n=== TPS ===');
      console.log('ttfc:', meter.msToFirstChunk ?? 'n/a', 'ms');
      console.log(
        'ttft:',
        meter.firstTextAt == null
          ? 'n/a'
          : `${(meter.firstTextAt - meter.startedAt).toFixed(0)} ms`,
      );
      console.log('tool time:', `${meter.toolMs.toFixed(0)} ms`);
      console.log(
        'end-to-end tps:',
        tokPerSecond(totalUsage.outputTokens, totalMs),
      );
      console.log(
        'visible-text tps:',
        tokPerSecond(totalUsage.outputTokenDetails.textTokens, totalMs),
      );
      console.log(
        'visible-text tps after first text:',
        tokPerSecond(totalUsage.outputTokenDetails.textTokens, visibleTextMs),
      );
      console.log(
        'approx model-only tps:',
        tokPerSecond(totalUsage.outputTokens, modelOnlyMs),
      );
    },
  });

  for await (const text of result.textStream) {
    process.stdout.write(text);
  }

  console.log();
});
