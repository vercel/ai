import type {
  LanguageModelV3,
  LanguageModelV3StreamPart,
} from '@ai-sdk/provider';
import { streamText } from 'ai';

const thoughtSignature = 'issue-18073-thought-signature';
const providerMetadata = {
  google: { thoughtSignature },
};

const rawFinalChunk = {
  candidates: [
    {
      content: {
        role: 'model',
        parts: [{ text: '', thoughtSignature }],
      },
      finishReason: 'STOP',
    },
  ],
};

const model: LanguageModelV3 = {
  specificationVersion: 'v3',
  provider: 'google',
  modelId: 'gemini-3-flash-preview',
  supportedUrls: {},
  doGenerate: async () => {
    throw new Error('Not implemented for this streaming reproduction.');
  },
  doStream: async options => {
    if (options.includeRawChunks !== true) {
      throw new Error('Expected includeRawChunks to reach the provider.');
    }

    const chunks: LanguageModelV3StreamPart[] = [
      {
        type: 'response-metadata',
        id: 'response-id',
        modelId: 'gemini-3-flash-preview',
        timestamp: new Date(0),
      },
      { type: 'text-start', id: 'text-1' },
      { type: 'text-delta', id: 'text-1', delta: 'Hello' },
      { type: 'raw', rawValue: rawFinalChunk },
      {
        type: 'text-delta',
        id: 'text-1',
        delta: '',
        providerMetadata,
      },
      { type: 'text-end', id: 'text-1' },
      {
        type: 'finish',
        finishReason: { unified: 'stop', raw: 'STOP' },
        usage: {
          inputTokens: {
            total: 1,
            noCache: 1,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: 1,
            text: 1,
            reasoning: undefined,
          },
        },
      },
    ];

    return {
      stream: new ReadableStream<LanguageModelV3StreamPart>({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(chunk);
          }
          controller.close();
        },
      }),
    };
  },
};

async function main() {
  const result = streamText({
    model,
    prompt: 'Say hello.',
    includeRawChunks: true,
  });

  const fullStreamParts = [];
  for await (const part of result.fullStream) {
    fullStreamParts.push(part);
  }

  const [step] = await result.steps;
  const textPart = step.content.find(part => part.type === 'text');
  const rawHasSignature = fullStreamParts.some(
    part =>
      part.type === 'raw' &&
      JSON.stringify(part.rawValue).includes(thoughtSignature),
  );
  const forwardedMetadataDelta = fullStreamParts.some(
    part =>
      part.type === 'text-delta' &&
      part.text === '' &&
      part.providerMetadata?.google?.thoughtSignature === thoughtSignature,
  );
  const finalThoughtSignature =
    textPart?.providerMetadata?.google?.thoughtSignature;

  console.log(
    JSON.stringify(
      {
        rawHasSignature,
        forwardedMetadataDelta,
        finalText: textPart?.text,
        finalProviderMetadata: textPart?.providerMetadata,
      },
      null,
      2,
    ),
  );

  if (!rawHasSignature) {
    throw new Error(
      'Reproduction setup failed: raw provider chunk did not contain the thought signature.',
    );
  }

  if (textPart?.text !== 'Hello') {
    throw new Error(
      `Reproduction setup failed: expected final text "Hello", received ${JSON.stringify(textPart?.text)}.`,
    );
  }

  if (finalThoughtSignature !== thoughtSignature) {
    throw new Error(
      'Reproduced issue #18073: raw provider response contains the thought signature, but final step text content lost provider metadata.',
    );
  }

  if (!forwardedMetadataDelta) {
    throw new Error(
      'Expected the metadata-only empty text delta in the full stream.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
