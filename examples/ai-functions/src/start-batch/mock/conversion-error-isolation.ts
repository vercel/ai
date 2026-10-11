import type {
  Experimental_BatchV4 as BatchV4,
  LanguageModelV4GenerateResult,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { experimental_getBatchResults as getBatchResults } from 'ai';

const usage: LanguageModelV4Usage = {
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
};

function textResult(text: string): LanguageModelV4GenerateResult {
  return {
    content: [{ type: 'text', text }],
    finishReason: { unified: 'stop', raw: 'stop' },
    usage,
    warnings: [],
  };
}

const fileResult: LanguageModelV4GenerateResult = {
  content: [
    {
      type: 'file',
      mediaType: 'image/png',
      data: {
        type: 'url',
        url: new URL('https://example.com/generated.png'),
      },
    },
  ],
  finishReason: { unified: 'stop', raw: 'stop' },
  usage,
  warnings: [],
};

const provider: BatchV4 = {
  specificationVersion: 'v4',
  provider: 'mock.batch',
  supportedUrls: {},
  doStartBatch() {
    throw new Error('unused');
  },
  doGetBatchStatus() {
    throw new Error('unused');
  },
  async doGetBatchResults() {
    return new ReadableStream({
      start(controller) {
        controller.enqueue({
          type: 'text',
          id: 'before',
          status: 'succeeded',
          result: textResult('first'),
        });
        controller.enqueue({
          type: 'text',
          id: 'file',
          status: 'succeeded',
          result: fileResult,
        });
        controller.enqueue({
          type: 'text',
          id: 'after',
          status: 'succeeded',
          result: textResult('last'),
        });
        controller.close();
      },
    });
  },
};

const runtimeGlobal = globalThis as typeof globalThis & {
  EdgeRuntime?: string;
};
const originalEdgeRuntime = runtimeGlobal.EdgeRuntime;
const originalFetch = globalThis.fetch;
runtimeGlobal.EdgeRuntime = 'example';
globalThis.fetch = async () =>
  new Response('synthetic download failure', { status: 503 });

const seen: string[] = [];

try {
  for await (const item of getBatchResults({
    provider,
    batch: { version: 2, id: 'batch', provider: 'mock.batch' },
    maxRetries: 0,
    onConversionError: 'yield',
  })) {
    seen.push(item.id);

    if (item.status === 'succeeded' && item.type === 'text') {
      console.log(item.id, item.text);
    } else if (item.status === 'conversion-failed' && item.type === 'text') {
      console.log(
        item.id,
        item.status,
        item.error instanceof Error ? item.error.name : 'unknown error',
        item.rawResult.content.length,
      );
    }
  }
} finally {
  globalThis.fetch = originalFetch;
  if (originalEdgeRuntime == null) {
    delete runtimeGlobal.EdgeRuntime;
  } else {
    runtimeGlobal.EdgeRuntime = originalEdgeRuntime;
  }
}

if (!seen.includes('after')) {
  throw new Error('Expected later batch items to remain available.');
}
