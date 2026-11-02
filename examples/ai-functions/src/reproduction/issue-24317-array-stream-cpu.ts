import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { Output, streamObject, streamText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import * as z3 from 'zod/v3';
import * as z4 from 'zod/v4';

// No provider, network, credentials, or product-code changes.
// Primary regression: superlinear CPU cost while consuming complete elements.
// Timer delay measures the impact on unrelated work. Validation counts are
// diagnostic only: a valid fix need not implement a particular caching scheme.
const words =
  'the cell membrane controls which substances enter and leave the cell ';

function makeElements(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    question: `Q${i} ${words.repeat(2)}`,
    choices: [1, 2, 3, 4].map(c => `${c} ${words}`),
    answerIdx: i % 4,
    explanation: words.repeat(5),
  }));
}

async function measure(
  count: number,
  piece: number,
  api: 'streamText' | 'streamObject' = 'streamText',
  schemaVersion: 'v3' | 'v4' = 'v4',
) {
  let validations = 0;
  const fields = {
    question: z4.string(),
    choices: z4.array(z4.string()).length(4),
    answerIdx: z4.number(),
    explanation: z4.string(),
  };
  const schema =
    schemaVersion === 'v4'
      ? z4.object(fields).superRefine(() => {
          validations++;
        })
      : z3
          .object({
            question: z3.string(),
            choices: z3.array(z3.string()).length(4),
            answerIdx: z3.number(),
            explanation: z3.string(),
          })
          .superRefine(() => {
            validations++;
          });
  const expected = makeElements(count);
  const text = JSON.stringify({ elements: expected });
  const model = new MockLanguageModelV4({
    async doStream() {
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] });
            controller.enqueue({ type: 'text-start', id: 't' });
            for (let i = 0; i < text.length; i += piece) {
              controller.enqueue({
                type: 'text-delta',
                id: 't',
                delta: text.slice(i, i + piece),
              });
            }
            controller.enqueue({ type: 'text-end', id: 't' });
            controller.enqueue({
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
            });
            controller.close();
          },
        }),
      };
    },
  });

  // The timer is scheduled before streaming, and awaited AFTER consumption.
  // This measures its actual delay, not a superseded transitional state.
  const start = performance.now();
  const timer = new Promise<number>(resolve => {
    setTimeout(() => resolve(performance.now() - start), 0);
  });
  const cpuStart = process.cpuUsage();
  const result =
    api === 'streamText'
      ? streamText({
          model,
          prompt: 'Return elements',
          output: Output.array({ element: schema }),
        })
      : streamObject({
          model,
          prompt: 'Return elements',
          output: 'array',
          schema,
        });
  let got = 0;
  const quarterCpuMs: number[] = [];
  for await (const value of result.elementStream) {
    assert.deepEqual(
      value,
      expected[got],
      'Complete elements must match input',
    );
    got++;
    if (got % Math.max(1, Math.floor(count / 4)) === 0) {
      const cpu = process.cpuUsage(cpuStart);
      quarterCpuMs.push((cpu.user + cpu.system) / 1000);
    }
  }
  const cpu = process.cpuUsage(cpuStart);
  const cpuMs = (cpu.user + cpu.system) / 1000;
  const timerMs = await timer;
  assert.equal(got, count, 'All elements must be delivered exactly once');
  const measurement = {
    api,
    schemaVersion,
    count,
    piece,
    chunks: Math.ceil(text.length / piece),
    got,
    validations,
    cpuMs: Math.round(cpuMs),
    timerMs: Math.round(timerMs),
    quarterCpuMs: quarterCpuMs.map(Math.round),
  };
  console.log(JSON.stringify(measurement));
  return { cpuMs, timerMs };
}

async function main() {
  console.log(`Node ${process.version}; workspace ai@7.0.159; mocked stream`);
  // Warm both parsers before measuring; startup/JIT is not the reported bug.
  await measure(20, 12);
  await measure(20, 12);
  const small = await measure(50, 12);
  await measure(100, 12);
  const large = await measure(200, 12);
  // Fresh-stream reset, supported Zod 3 comparison, and the legacy API with
  // smaller chunks reported in the issue. The production schema was not given.
  await measure(20, 12);
  await measure(50, 12, 'streamText', 'v3');
  await measure(200, 12, 'streamObject');
  await measure(200, 4, 'streamObject');

  // Four times the data should take roughly four times the CPU. Allow twice
  // that ratio plus 100 ms noise, rather than depending on laptop timings.
  // An incremental/linear implementation passes regardless of validation count,
  // chunk publication strategy, or whether it yields to unrelated timer work.
  const budgetMs = small.cpuMs * 8 + 100;
  console.log(
    `200/50 CPU ratio: ${(large.cpuMs / small.cpuMs).toFixed(2)}; ` +
      `200-element CPU budget: ${Math.round(budgetMs)} ms`,
  );
  assert.ok(
    large.cpuMs <= budgetMs,
    'Output.array streaming exceeds the linear CPU budget',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
