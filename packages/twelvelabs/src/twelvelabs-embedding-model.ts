import { EmbeddingModelV2, EmbeddingModelV2Embedding } from '@ai-sdk/provider';
import { TwelveLabs } from 'twelvelabs-js';
import { mapTwelveLabsError } from './twelvelabs-error';
import { TwelveLabsEmbeddingModelId } from './twelvelabs-settings';

export interface TwelveLabsEmbeddingModelSettings {
  client: TwelveLabs;
  modelId: TwelveLabsEmbeddingModelId;
}

export class TwelveLabsEmbeddingModel implements EmbeddingModelV2<string> {
  readonly specificationVersion = 'v2' as const;
  readonly provider = 'twelvelabs' as const;

  // Twelve Labs embeddings are 1024-dimensional for Marengo-retrieval-2.7
  readonly dimensions = 1024;

  readonly supportsParallelCalls = true;
  readonly maxValuesPerCall = 100;
  readonly maxEmbeddingsPerCall = 100;

  private readonly client: TwelveLabs;

  constructor(
    public readonly modelId: TwelveLabsEmbeddingModelId,
    settings: TwelveLabsEmbeddingModelSettings,
  ) {
    this.client = settings.client;
  }

  async doEmbed(options: {
    values: string[];
    headers?: Record<string, string>;
    abortSignal?: AbortSignal;
  }): Promise<{
    embeddings: EmbeddingModelV2Embedding[];
    usage?: { tokens: number };
  }> {
    if (options.values.length === 0) {
      return { embeddings: [], usage: { tokens: 0 } };
    }

    try {
      const embeddings = await Promise.all(
        options.values.map(async text => {
          // Map model IDs to actual API model names
          const apiModelName =
            this.modelId === 'marengo2.7'
              ? 'Marengo-retrieval-2.7'
              : this.modelId;

          const result = await this.client.embed.create({
            modelName: apiModelName,
            text: text,
            textTruncate: 'end',
          } as any);

          const embedding = (result as any).textEmbedding?.segments?.[0]?.float;

          if (!embedding || !Array.isArray(embedding)) {
            throw new Error(
              `No embedding returned for text: ${text.substring(0, 50)}...`,
            );
          }

          return embedding;
        }),
      );

      const estimatedTokens = options.values.reduce(
        (sum, text) => sum + Math.ceil(text.length / 4),
        0,
      );

      return {
        embeddings,
        usage: { tokens: estimatedTokens },
      };
    } catch (error) {
      throw mapTwelveLabsError(error);
    }
  }

  async embedValue(value: string): Promise<{ value: number[] }> {
    const result = await this.doEmbed({ values: [value] });
    return { value: result.embeddings[0] };
  }

  async embedValues(values: string[]): Promise<{ values: number[][] }> {
    const result = await this.doEmbed({ values });
    return { values: result.embeddings };
  }
}
