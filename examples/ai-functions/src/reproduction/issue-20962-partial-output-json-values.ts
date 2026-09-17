import assert from 'node:assert/strict';
import {
  Output,
  simulateReadableStream,
  streamText,
  ToolLoopAgent,
  type JSONValue,
} from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

const values: JSONValue[] = [null, '', false, 0, {}, []];

function createModel(value: JSONValue) {
  return new MockLanguageModelV3({
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
              outputTokens: {
                total: 1,
                text: 1,
                reasoning: 0,
              },
            },
          },
        ],
      }),
    }),
  });
}

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of stream) {
    values.push(value);
  }
  return values;
}

async function runStreamText(value: JSONValue) {
  const result = streamText({
    model: createModel(value),
    prompt: 'Return JSON.',
    output: Output.json(),
  });
  const outputPromise = result.output;

  return {
    partials: await collect(result.partialOutputStream),
    output: await outputPromise,
  };
}

async function runToolLoopAgent(value: JSONValue) {
  const agent = new ToolLoopAgent({
    model: createModel(value),
    output: Output.json(),
  });
  const result = await agent.stream({ prompt: 'Return JSON.' });
  const outputPromise = result.output;

  return {
    partials: await collect(result.partialOutputStream),
    output: await outputPromise,
  };
}

async function main() {
  const affectedFailures: string[] = [];

  for (const value of values) {
    for (const [api, run] of [
      ['streamText', runStreamText],
      ['ToolLoopAgent.stream', runToolLoopAgent],
    ] as const) {
      const { partials, output } = await run(value);
      const expectedPartials = [value];

      assert.deepStrictEqual(
        output,
        value,
        `${api} final output did not preserve ${JSON.stringify(value)}`,
      );

      try {
        assert.deepStrictEqual(partials, expectedPartials);
      } catch {
        if ((value === null || value === '') && partials.length === 0) {
          affectedFailures.push(`${api}:${JSON.stringify(value)}`);
          continue;
        }

        throw new Error(
          `Unexpected partial output for ${api} and ${JSON.stringify(value)}: ` +
            `${JSON.stringify(partials)}`,
        );
      }
    }
  }

  if (
    affectedFailures.length === 4 &&
    affectedFailures.includes('streamText:null') &&
    affectedFailures.includes('streamText:""') &&
    affectedFailures.includes('ToolLoopAgent.stream:null') &&
    affectedFailures.includes('ToolLoopAgent.stream:""')
  ) {
    throw new Error(
      'ISSUE_20962_REPRODUCED: partialOutputStream dropped valid JSON null and empty string values in streamText and ToolLoopAgent.stream',
    );
  }

  assert.deepStrictEqual(
    affectedFailures,
    [],
    `Only some reported cases failed: ${affectedFailures.join(', ')}`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
