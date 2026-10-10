import assert from 'node:assert/strict';
import {
  experimental_startVideo,
  experimental_streamTranslate,
  rerank,
} from 'ai';

const failureSignal =
  'ISSUE_22656_REPRODUCED: string model resolution lost the provider receiver for speech translation, video, and reranking';

type FactoryName = 'speechTranslationModel' | 'videoModel' | 'rerankingModel';

class StatefulProvider {
  readonly specificationVersion = 'v4' as const;
  readonly #name = 'mock';

  languageModel() {
    throw new Error('unused');
  }

  embeddingModel() {
    throw new Error('unused');
  }

  imageModel() {
    throw new Error('unused');
  }

  speechTranslationModel(modelId: string) {
    return {
      specificationVersion: 'v4' as const,
      provider: this.#name,
      modelId,
      async doStream() {
        return {
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({
                type: 'finish',
                sourceText: 'hola',
                outputText: 'hello',
              });
              controller.close();
            },
          }),
        };
      },
    };
  }

  videoModel(modelId: string) {
    return {
      specificationVersion: 'v4' as const,
      provider: this.#name,
      modelId,
      maxVideosPerCall: undefined,
      async doStart() {
        return {
          operation: 'job',
          warnings: [],
          response: {
            timestamp: new Date(0),
            modelId,
            headers: undefined,
          },
        };
      },
    };
  }

  rerankingModel(modelId: string) {
    return {
      specificationVersion: 'v4' as const,
      provider: this.#name,
      modelId,
      async doRerank() {
        return {
          ranking: [{ index: 0, relevanceScore: 1 }],
        };
      },
    };
  }
}

const cases: Array<{
  factory: FactoryName;
  expected: unknown;
  run: (model: any) => Promise<unknown>;
}> = [
  {
    factory: 'speechTranslationModel',
    expected: 'hello',
    run: async model =>
      experimental_streamTranslate({
        model,
        audio: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.close();
          },
        }),
        inputAudioFormat: { type: 'pcm', sampleRate: 24000 },
        targetLanguage: 'en',
      }).translationText,
  },
  {
    factory: 'videoModel',
    expected: 'job',
    run: async model =>
      (await experimental_startVideo({ model, prompt: 'hello' })).operation,
  },
  {
    factory: 'rerankingModel',
    expected: ['hello'],
    run: async model =>
      (await rerank({ model, query: 'hello', documents: ['hello'] }))
        .rerankedDocuments,
  },
];

async function main() {
  const statefulProvider = new StatefulProvider();
  const globalWithProvider = globalThis as typeof globalThis & {
    AI_SDK_DEFAULT_PROVIDER?: any;
  };
  const originalProvider = globalWithProvider.AI_SDK_DEFAULT_PROVIDER;

  try {
    // Direct model controls prove that each class factory and model operation
    // works when the member call retains its receiver.
    for (const testCase of cases) {
      const directModel = statefulProvider[testCase.factory]('model');
      assert.deepEqual(
        await testCase.run(directModel),
        testCase.expected,
        `${testCase.factory} direct-model control`,
      );
    }

    // Closure-based providers do not depend on a receiver and continue to work
    // through string model resolution.
    const providerName = 'mock';
    globalWithProvider.AI_SDK_DEFAULT_PROVIDER = {
      specificationVersion: 'v4',
      languageModel: () => {
        throw new Error('unused');
      },
      embeddingModel: () => {
        throw new Error('unused');
      },
      imageModel: () => {
        throw new Error('unused');
      },
      speechTranslationModel: (modelId: string) => ({
        specificationVersion: 'v4',
        provider: providerName,
        modelId,
        async doStream() {
          return {
            stream: new ReadableStream({
              start(controller) {
                controller.enqueue({
                  type: 'finish',
                  sourceText: 'hola',
                  outputText: 'hello',
                });
                controller.close();
              },
            }),
          };
        },
      }),
      videoModel: (modelId: string) => ({
        specificationVersion: 'v4',
        provider: providerName,
        modelId,
        maxVideosPerCall: undefined,
        async doStart() {
          return {
            operation: 'job',
            warnings: [],
            response: {
              timestamp: new Date(0),
              modelId,
              headers: undefined,
            },
          };
        },
      }),
      rerankingModel: (modelId: string) => ({
        specificationVersion: 'v4',
        provider: providerName,
        modelId,
        async doRerank() {
          return {
            ranking: [{ index: 0, relevanceScore: 1 }],
          };
        },
      }),
    };

    for (const testCase of cases) {
      assert.deepEqual(
        await testCase.run('model'),
        testCase.expected,
        `${testCase.factory} closure-provider control`,
      );
    }

    globalWithProvider.AI_SDK_DEFAULT_PROVIDER = statefulProvider;

    const outcomes = [];
    for (const testCase of cases) {
      try {
        outcomes.push({
          factory: testCase.factory,
          value: await testCase.run('model'),
        });
      } catch (error) {
        outcomes.push({
          factory: testCase.factory,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const receiverFailures = outcomes.filter(
      (
        outcome,
      ): outcome is {
        factory: FactoryName;
        error: string;
      } => 'error' in outcome && outcome.error.includes('#name'),
    );

    if (
      receiverFailures.length === cases.length &&
      receiverFailures.every(
        (outcome, index) => outcome.factory === cases[index].factory,
      )
    ) {
      throw new Error(failureSignal);
    }

    for (const testCase of cases) {
      const outcome = outcomes.find(
        outcome => outcome.factory === testCase.factory,
      );
      assert.ok(outcome && 'value' in outcome, `${testCase.factory} by ID`);
      assert.deepEqual(outcome.value, testCase.expected);
    }
  } finally {
    globalWithProvider.AI_SDK_DEFAULT_PROVIDER = originalProvider;
  }
}

await main();
