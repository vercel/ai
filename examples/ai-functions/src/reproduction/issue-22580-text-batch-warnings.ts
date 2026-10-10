import type {
  Experimental_BatchV4,
  Experimental_BatchV4ItemResult,
  SharedV4Warning,
} from '@ai-sdk/provider';
import { experimental_getBatchResults } from 'ai';
import assert from 'node:assert/strict';

const warnings: Array<SharedV4Warning> = [
  {
    type: 'other',
    message: 'Provider returned a fallback result',
  },
];

const provider = {
  specificationVersion: 'v4',
  provider: 'example',
  supportedUrls: {},
  async doStartBatch() {
    throw new Error('unused');
  },
  async doGetBatchStatus() {
    throw new Error('unused');
  },
  async doGetBatchResults() {
    return new ReadableStream<Experimental_BatchV4ItemResult>({
      start(controller) {
        controller.enqueue({
          type: 'text',
          id: 'text-1',
          status: 'succeeded',
          result: {
            content: [{ type: 'text', text: 'ok' }],
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: {
              inputTokens: {
                total: 1,
                noCache: undefined,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: {
                total: 1,
                text: undefined,
                reasoning: undefined,
              },
            },
            warnings,
          },
        });
        controller.enqueue({
          type: 'image',
          id: 'image-1',
          status: 'succeeded',
          result: {
            images: [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
            warnings,
            response: {
              timestamp: new Date(0),
              modelId: 'image',
              headers: undefined,
            },
          },
        });
        controller.close();
      },
    });
  },
} satisfies Experimental_BatchV4;

async function main() {
  const results = [];
  for await (const item of experimental_getBatchResults({
    provider,
    batch: { version: 2, provider: 'example', id: 'batch-1' },
  })) {
    results.push(item);
  }

  const textResult = results.find(item => item.id === 'text-1');
  const imageResult = results.find(item => item.id === 'image-1');

  assert.ok(
    textResult?.type === 'text' && textResult.status === 'succeeded',
    'Expected a successful text result.',
  );
  assert.equal(textResult.text, 'ok');

  assert.ok(
    imageResult?.type === 'image' && imageResult.status === 'succeeded',
    'Expected a successful image result.',
  );
  assert.deepEqual(imageResult.warnings, warnings);

  const textWarnings = (textResult as unknown as { warnings?: unknown })
    .warnings;
  try {
    assert.deepEqual(textWarnings, warnings);
  } catch {
    console.error(
      'ISSUE_22580: successful text batch result dropped provider warnings',
    );
    process.exitCode = 1;
    return;
  }

  console.log('Issue #22580 did not reproduce.');
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
