import assert from 'node:assert/strict';
import { Output, simulateReadableStream, streamText, ToolLoopAgent } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const values = [null, '', false, 0, {}, []] as const;

function createModel(value: (typeof values)[number]) {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 'text-1' },
          {
            type: 'text-delta',
            id: 'text-1',
            delta: JSON.stringify(value),
          },
          { type: 'text-end', id: 'text-1' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: {
              inputTokens: {
                total: 1,
                noCache: 1,
                cacheRead: 0,
                cacheWrite: 0,
              },
              outputTokens: { total: 1, text: 1, reasoning: 0 },
            },
          },
        ],
      }),
    }),
  });
}

async function collect(value: (typeof values)[number], useAgent: boolean) {
  const result = useAgent
    ? await new ToolLoopAgent({
        model: createModel(value),
        output: Output.json(),
      }).stream({ prompt: 'Return JSON.' })
    : streamText({
        model: createModel(value),
        prompt: 'Return JSON.',
        output: Output.json(),
      });

  const partials: unknown[] = [];
  for await (const partial of result.partialOutputStream) {
    partials.push(partial);
  }

  return { partials, output: await result.output };
}

function label(value: (typeof values)[number]) {
  return JSON.stringify(value);
}

async function main() {
  const observations: Array<{
    api: 'streamText' | 'ToolLoopAgent.stream';
    value: (typeof values)[number];
    partials: unknown[];
    output: unknown;
  }> = [];

  for (const useAgent of [false, true]) {
    for (const value of values) {
      observations.push({
        api: useAgent ? 'ToolLoopAgent.stream' : 'streamText',
        value,
        ...(await collect(value, useAgent)),
      });
    }
  }

  for (const observation of observations) {
    assert.deepStrictEqual(
      observation.output,
      observation.value,
      `${observation.api} returned the wrong final output for ${label(observation.value)}`,
    );
  }

  const controls = observations.filter(
    observation => observation.value !== null && observation.value !== '',
  );
  for (const observation of controls) {
    assert.deepStrictEqual(
      observation.partials,
      [observation.value],
      `${observation.api} failed a control partial output for ${label(observation.value)}`,
    );
  }

  const affected = observations.filter(
    observation => observation.value === null || observation.value === '',
  );
  const omitted = affected.filter(
    observation => observation.partials.length === 0,
  );

  if (omitted.length === affected.length) {
    const cases = omitted
      .map(observation => `${observation.api}(${label(observation.value)})`)
      .join(', ');
    throw new Error(
      `ISSUE_20962_REPRODUCED: partialOutputStream omitted valid JSON values: ${cases}`,
    );
  }

  for (const observation of affected) {
    assert.deepStrictEqual(
      observation.partials,
      [observation.value],
      `${observation.api} omitted a valid JSON partial output for ${label(observation.value)}`,
    );
  }
}

main();
