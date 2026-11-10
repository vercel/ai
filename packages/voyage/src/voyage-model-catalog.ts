import type {
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { VoyageEmbeddingModelOptions } from './voyage-embedding-model-options';
import type { VoyageRerankingModelOptions } from './reranking/voyage-reranking-model-options';
/** Known options accepted under providerOptions; open-ended extension keys remain undeclared. */
export const voyageProviderOptions = {
  embedding: {
    inputType: { description: 'inputType' },
    truncation: { description: 'truncation' },
    outputDimension: { description: 'outputDimension' },
    outputDtype: { description: 'outputDtype' },
  } satisfies Record<
    keyof VoyageEmbeddingModelOptions,
    ProviderOptionDefinition
  >,
  reranking: {
    returnDocuments: { description: 'returnDocuments' },
    truncation: { description: 'truncation' },
  } satisfies Record<
    keyof VoyageRerankingModelOptions,
    ProviderOptionDefinition
  >,
} as const satisfies ProviderOptionDefinitions;

const embeddingModelIds = [
  'voyage-4-large',
  'voyage-4',
  'voyage-4-lite',
  'voyage-4-nano',
  'voyage-code-3.5',
  'voyage-code-3',
  'voyage-3-large',
  'voyage-3.5',
  'voyage-3.5-lite',
  'voyage-3',
  'voyage-3-lite',
  'voyage-finance-2',
  'voyage-law-2',
  'voyage-multilingual-2',
  'voyage-code-2',
  'voyage-2',
] as const;
const rerankingModelIds = [
  'rerank-2.5',
  'rerank-2.5-lite',
  'rerank-2',
  'rerank-2-lite',
  'rerank-1',
  'rerank-lite-1',
] as const;
const embeddingDefinitions: Partial<
  Record<string, { defaultDimensions: number; maxTokens: number }>
> = {
  'voyage-4-large': { defaultDimensions: 1024, maxTokens: 32000 },
  'voyage-4': { defaultDimensions: 1024, maxTokens: 32000 },
  'voyage-4-lite': { defaultDimensions: 1024, maxTokens: 32000 },
  'voyage-4-nano': { defaultDimensions: 1024, maxTokens: 32000 },
  'voyage-code-3.5': { defaultDimensions: 1024, maxTokens: 32000 },
  'voyage-code-3': { defaultDimensions: 1024, maxTokens: 32000 },
  'voyage-3-large': { defaultDimensions: 1024, maxTokens: 32000 },
  'voyage-3.5': { defaultDimensions: 1024, maxTokens: 32000 },
  'voyage-3.5-lite': { defaultDimensions: 1024, maxTokens: 32000 },
  'voyage-3': { defaultDimensions: 1024, maxTokens: 32000 },
  'voyage-3-lite': { defaultDimensions: 512, maxTokens: 32000 },
  'voyage-finance-2': { defaultDimensions: 1024, maxTokens: 32000 },
  'voyage-multilingual-2': { defaultDimensions: 1024, maxTokens: 32000 },
  'voyage-law-2': { defaultDimensions: 1024, maxTokens: 16000 },
  'voyage-code-2': { defaultDimensions: 1536, maxTokens: 16000 },
};
const rerankingDefinitions: Partial<Record<string, { maxTokens: number }>> = {
  'rerank-2.5': { maxTokens: 32000 },
  'rerank-2.5-lite': { maxTokens: 32000 },
  'rerank-2': { maxTokens: 16000 },
  'rerank-2-lite': { maxTokens: 8000 },
  'rerank-1': { maxTokens: 8000 },
  'rerank-lite-1': { maxTokens: 4000 },
};
const flexibleDimensions = new Set([
  'voyage-4-large',
  'voyage-4',
  'voyage-4-lite',
  'voyage-4-nano',
  'voyage-code-3.5',
  'voyage-code-3',
  'voyage-3-large',
  'voyage-3.5',
  'voyage-3.5-lite',
]);
export const voyageEmbeddingLimits = {
  maxEmbeddingsPerCall: 128,
  supportsParallelCalls: true,
} as const;
export function getVoyageEmbeddingModelEntry(modelId: string) {
  const definition = embeddingDefinitions[modelId];
  const customDimensions = flexibleDimensions.has(modelId)
    ? true
    : ('unknown' as const);
  const entry = {
    capabilities: {
      ...(definition
        ? {
            embedding: {
              ...definition,
              customDimensions,
              dimensions: flexibleDimensions.has(modelId)
                ? [256, 512, 1024, 2048]
                : undefined,
              ...voyageEmbeddingLimits,
            },
          }
        : {}),
    },
    providerOptions: {
      embedding: Object.fromEntries(
        Object.keys(voyageProviderOptions.embedding).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
    },
    requestConfig: { embedding: voyageEmbeddingLimits },
  } as const;
  return entry satisfies ModelEntry<{
    embedding: typeof voyageEmbeddingLimits;
  }>;
}
export function getVoyageRerankingModelEntry(modelId: string) {
  const entry = {
    capabilities: {
      reranking: {
        documents: { text: true, object: true },
        topN: true,
        ...rerankingDefinitions[modelId],
      },
    },
    providerOptions: {
      reranking: Object.fromEntries(
        Object.keys(voyageProviderOptions.reranking).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
    },
  } as const;
  return entry satisfies ModelEntry;
}
export const voyageModelCatalog = Object.fromEntries([
  ...embeddingModelIds.map(
    id => [id, getVoyageEmbeddingModelEntry(id)] as const,
  ),
  ...rerankingModelIds.map(
    id => [id, getVoyageRerankingModelEntry(id)] as const,
  ),
]);
