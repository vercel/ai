import { strict as assert } from 'node:assert';
import { embed, generateImage } from 'ai';

type Version = 'v2' | 'v3' | 'v4';

class EmbeddingModel {
  readonly provider = 'mock';
  readonly modelId = 'mock';
  readonly maxEmbeddingsPerCall = 1;
  readonly supportsParallelCalls = false;
  readonly specificationVersion: Version;

  #vector = [1, 2];

  constructor(version: Version) {
    this.specificationVersion = version;
  }

  async doEmbed() {
    return {
      embeddings: [this.#vector],
      usage: { tokens: 1 },
    };
  }
}

class ImageModel {
  readonly provider = 'mock';
  readonly modelId = 'mock';
  readonly maxImagesPerCall = 1;
  readonly specificationVersion: Version;

  #image = 'iVBORw0KGgo=';

  constructor(version: Version) {
    this.specificationVersion = version;
  }

  async doGenerate() {
    return {
      images: [this.#image],
      warnings: [],
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
      },
    };
  }
}

type Outcome =
  | {
      version: Version;
      kind: 'embedding' | 'image';
      value: number[] | string;
    }
  | {
      version: Version;
      kind: 'embedding' | 'image';
      error: string;
    };

async function main() {
  const outcomes: Outcome[] = [];

  for (const version of ['v4', 'v3', 'v2'] as const) {
    const operations = [
      {
        kind: 'embedding' as const,
        run: async () =>
          (
            await embed({
              model: new EmbeddingModel(version) as never,
              value: 'hello',
            })
          ).embedding,
      },
      {
        kind: 'image' as const,
        run: async () =>
          (
            await generateImage({
              model: new ImageModel(version) as never,
              prompt: 'hello',
            })
          ).image.base64,
      },
    ];

    for (const { kind, run } of operations) {
      try {
        outcomes.push({ version, kind, value: await run() });
      } catch (error) {
        outcomes.push({
          version,
          kind,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  console.log(JSON.stringify(outcomes, null, 2));

  const v4Embedding = outcomes.find(
    outcome => outcome.version === 'v4' && outcome.kind === 'embedding',
  );
  const v4Image = outcomes.find(
    outcome => outcome.version === 'v4' && outcome.kind === 'image',
  );

  assert.deepEqual(
    v4Embedding,
    { version: 'v4', kind: 'embedding', value: [1, 2] },
    'The unadapted v4 embedding control must succeed',
  );
  assert.deepEqual(
    v4Image,
    { version: 'v4', kind: 'image', value: 'iVBORw0KGgo=' },
    'The unadapted v4 image control must succeed',
  );

  const compatibilityOutcomes = outcomes.filter(
    outcome => outcome.version !== 'v4',
  );
  const privateFieldFailures = compatibilityOutcomes.filter(
    outcome =>
      'error' in outcome &&
      outcome.error.includes('Cannot read private member') &&
      outcome.error.includes('from an object whose class did not declare it'),
  );

  if (privateFieldFailures.length > 0) {
    throw new Error(
      'ISSUE_22659_REPRODUCED: v2/v3 embedding and image compatibility adapters do not preserve private-field method receivers',
    );
  }

  assert.deepEqual(compatibilityOutcomes, [
    { version: 'v3', kind: 'embedding', value: [1, 2] },
    { version: 'v3', kind: 'image', value: 'iVBORw0KGgo=' },
    { version: 'v2', kind: 'embedding', value: [1, 2] },
    { version: 'v2', kind: 'image', value: 'iVBORw0KGgo=' },
  ]);
}

await main();
