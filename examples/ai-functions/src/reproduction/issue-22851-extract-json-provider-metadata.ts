import type {
  LanguageModelV4,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { extractJsonMiddleware, streamText, wrapLanguageModel } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

const metadata = { mock: { annotation: 'keep-me' } };

const model = new MockLanguageModelV4({
  provider: 'mock',
  modelId: 'mock',
  doStream: async () => ({
    stream: new ReadableStream({
      start(controller) {
        const parts: LanguageModelV4StreamPart[] = [
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 't' },
          {
            type: 'text-delta',
            id: 't',
            delta: '{"ok":true}',
            providerMetadata: metadata,
          },
          { type: 'text-end', id: 't' },
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
        ];

        for (const part of parts) {
          controller.enqueue(part);
        }
        controller.close();
      },
    }),
  }),
});

async function getTextPart(selectedModel: LanguageModelV4) {
  const result = streamText({ model: selectedModel, prompt: 'test' });
  await result.consumeStream();
  return (await result.content).find(part => part.type === 'text');
}

async function main() {
  const plain = await getTextPart(model);
  assert.ok(plain, 'Control stream did not produce a text part');
  assert.deepEqual(
    plain.providerMetadata,
    metadata,
    'Control stream did not retain providerMetadata',
  );

  const wrapped = await getTextPart(
    wrapLanguageModel({
      model,
      middleware: extractJsonMiddleware(),
    }),
  );
  assert.ok(wrapped, 'Wrapped stream did not produce a text part');

  if (!isDeepStrictEqual(wrapped.providerMetadata, metadata)) {
    console.error(
      'ISSUE_22851: extractJsonMiddleware dropped providerMetadata from streamed text content',
    );
    console.error(
      JSON.stringify({
        plainProviderMetadata: plain.providerMetadata,
        wrappedProviderMetadata: wrapped.providerMetadata,
      }),
    );
    process.exitCode = 1;
    return;
  }

  console.log('Issue #22851 did not reproduce.');
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
