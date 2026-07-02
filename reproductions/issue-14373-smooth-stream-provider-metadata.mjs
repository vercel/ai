import assert from 'node:assert/strict';
import { smoothStream } from '../packages/ai/dist/index.js';

const providerMetadata = {
  anthropic: {
    thinkingSignature: 'signature-from-provider-delta',
  },
};

const transform = smoothStream({
  chunking: 'word',
  delayInMs: null,
  _internal: { delay: async () => {} },
})({ tools: {} });

const input = new ReadableStream({
  start(controller) {
    controller.enqueue({
      type: 'reasoning-delta',
      id: 'reasoning-1',
      text: 'alpha beta tail',
      providerMetadata,
    });

    // Force smoothStream to flush the trailing non-word-boundary remainder
    // through its flushBuffer path, then pass this non-smoothable part through.
    controller.enqueue({ type: 'finish-step' });
    controller.close();
  },
});

const outputParts = [];
for await (const part of input.pipeThrough(transform)) {
  outputParts.push(part);
}

console.log(JSON.stringify(outputParts, null, 2));

const reasoningParts = outputParts.filter(part => part.type === 'reasoning-delta');
assert.equal(reasoningParts.length, 3, 'expected word chunks plus flushed tail');

for (const [index, part] of reasoningParts.entries()) {
  assert.deepEqual(
    part.providerMetadata,
    providerMetadata,
    `reasoning-delta chunk ${index} (${JSON.stringify(part.text)}) lost providerMetadata`,
  );
}
