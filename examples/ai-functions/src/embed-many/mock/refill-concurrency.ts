import assert from 'node:assert/strict';
import { embedMany } from 'ai';
import { MockEmbeddingModelV4 } from 'ai/test';

let releaseSlow!: () => void;
const slow = new Promise<void>(resolve => {
  releaseSlow = resolve;
});

let markFastComplete!: () => void;
const fastComplete = new Promise<void>(resolve => {
  markFastComplete = resolve;
});

const names = ['slow', 'fast', 'next'];
const started: string[] = [];
let activeCalls = 0;
let peakCalls = 0;

const resultPromise = embedMany({
  maxParallelCalls: 2,
  model: new MockEmbeddingModelV4({
    maxEmbeddingsPerCall: 1,
    supportsParallelCalls: true,
    doEmbed: async ({ values: [value] }) => {
      started.push(value);
      peakCalls = Math.max(peakCalls, ++activeCalls);

      if (value === 'slow') {
        await slow;
      }

      activeCalls--;

      if (value === 'fast') {
        markFastComplete();
      }

      return {
        embeddings: [[names.indexOf(value)]],
        usage: { tokens: 1 },
        warnings: [],
      };
    },
  }),
  values: names,
});

await fastComplete;
await new Promise(resolve => setImmediate(resolve));
const startedBeforeSlowCompleted = [...started];

releaseSlow();
const result = await resultPromise;

assert.deepEqual(startedBeforeSlowCompleted, ['slow', 'fast', 'next']);
assert.equal(peakCalls, 2);
assert.deepEqual(result.embeddings, [[0], [1], [2]]);

console.log({
  startedBeforeSlowCompleted,
  peakCalls,
  embeddings: result.embeddings,
});
