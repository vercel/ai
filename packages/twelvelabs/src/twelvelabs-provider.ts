import {
  EmbeddingModelV2,
  LanguageModelV2,
  NoSuchModelError,
  ProviderV2,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { TwelveLabs } from 'twelvelabs-js';
import { TwelveLabsEmbeddingModel } from './twelvelabs-embedding-model';
import { TwelveLabsLanguageModel } from './twelvelabs-language-model';
import {
  TwelveLabsEmbeddingModelId,
  TwelveLabsModelId,
  TwelveLabsProviderSettings,
} from './twelvelabs-settings';

const DEFAULT_PEGASUS_INDEX_NAME = 'ai-sdk-pegasus';
const DEFAULT_MARENGO_INDEX_NAME = 'ai-sdk-marengo';
const DEFAULT_BASE_URL = 'https://api.twelvelabs.io/v1.3';

export interface TwelveLabsProvider extends ProviderV2 {
  /**
   * Creates a Twelve Labs language model for video analysis.
   */
  (modelId: TwelveLabsModelId): LanguageModelV2;

  /**
   * Creates a Twelve Labs language model for video analysis.
   */
  languageModel(modelId: TwelveLabsModelId): LanguageModelV2;

  /**
   * Creates a Twelve Labs language model for video analysis.
   * Alias for languageModel.
   */
  chat(modelId: TwelveLabsModelId): LanguageModelV2;

  /**
   * Creates a Twelve Labs embedding model.
   */
  embedding(modelId: TwelveLabsEmbeddingModelId): EmbeddingModelV2<string>;

  /**
   * Creates a Twelve Labs text embedding model.
   */
  textEmbedding(modelId: TwelveLabsEmbeddingModelId): EmbeddingModelV2<string>;

  /**
   * Creates a Twelve Labs text embedding model.
   */
  textEmbeddingModel(
    modelId: TwelveLabsEmbeddingModelId,
  ): EmbeddingModelV2<string>;
}

export function createTwelveLabs(
  options: TwelveLabsProviderSettings = {},
): TwelveLabsProvider {
  const apiKey = loadApiKey({
    apiKey: options.apiKey,
    environmentVariableName: 'TWELVELABS_API_KEY',
    description: 'Twelve Labs API key',
  });

  const baseURL = withoutTrailingSlash(options.baseURL ?? DEFAULT_BASE_URL);

  const pegasusIndexName =
    options.pegasusIndexName ??
    process.env.TWELVELABS_PEGASUS_INDEX_NAME ??
    DEFAULT_PEGASUS_INDEX_NAME;

  const marengoIndexName =
    options.marengoIndexName ??
    process.env.TWELVELABS_MARENGO_INDEX_NAME ??
    DEFAULT_MARENGO_INDEX_NAME;

  // Initialize Twelve Labs client
  const client = new TwelveLabs({ apiKey });

  // Store index IDs after initialization
  let pegasusIndexIdPromise: Promise<string | null> | null = null;
  let marengoIndexIdPromise: Promise<string | null> | null = null;

  const getOrCreatePegasusIndex = async (): Promise<string> => {
    if (pegasusIndexIdPromise) {
      const result = await pegasusIndexIdPromise;
      if (!result) {
        throw new Error('Failed to get or create Pegasus index');
      }
      return result;
    }

    pegasusIndexIdPromise = (async (): Promise<string | null> => {
      try {
        // Check if index exists
        const indexList = await client.indexes.list({} as any);
        const existingIndex = indexList.data?.find(
          (idx: any) => idx.indexName === pegasusIndexName,
        );

        if (existingIndex) {
          return existingIndex.id || null;
        }

        // Create new index with Pegasus model
        try {
          const newIndex = await client.indexes.create({
            indexName: pegasusIndexName,
            models: [
              {
                modelName: 'pegasus1.2',
                modelOptions: ['visual', 'audio'],
              },
            ],
          } as any);
          return newIndex.id || null;
        } catch (createError: any) {
          if (
            createError?.response?.data?.code === 'index_name_already_exists'
          ) {
            const retryList = await client.indexes.list({} as any);
            const existingIndex = retryList.data?.find(
              (idx: any) => idx.indexName === pegasusIndexName,
            );
            if (existingIndex) {
              return existingIndex.id || null;
            }
          }
          throw createError;
        }
      } catch (error) {
        pegasusIndexIdPromise = null;
        throw error;
      }
    })();

    const result = await pegasusIndexIdPromise;
    if (!result) {
      throw new Error('Failed to get or create Pegasus index');
    }
    return result;
  };

  const getOrCreateMarengoIndex = async (): Promise<string> => {
    if (marengoIndexIdPromise) {
      const result = await marengoIndexIdPromise;
      if (!result) {
        throw new Error('Failed to get or create Marengo index');
      }
      return result;
    }

    marengoIndexIdPromise = (async (): Promise<string | null> => {
      try {
        // Check if index exists
        const indexList = await client.indexes.list({} as any);
        const existingIndex = indexList.data?.find(
          (idx: any) => idx.indexName === marengoIndexName,
        );

        if (existingIndex) {
          return existingIndex.id || null;
        }

        // Create new index with Marengo model
        try {
          const newIndex = await client.indexes.create({
            indexName: marengoIndexName,
            models: [
              {
                modelName: 'marengo2.7',
                modelOptions: ['visual', 'audio'],
              },
            ],
          } as any);
          return newIndex.id || null;
        } catch (createError: any) {
          if (
            createError?.response?.data?.code === 'index_name_already_exists'
          ) {
            const retryList = await client.indexes.list({} as any);
            const existingIndex = retryList.data?.find(
              (idx: any) => idx.indexName === marengoIndexName,
            );
            if (existingIndex) {
              return existingIndex.id || null;
            }
          }
          throw createError;
        }
      } catch (error) {
        marengoIndexIdPromise = null;
        throw error;
      }
    })();

    const result = await marengoIndexIdPromise;
    if (!result) {
      throw new Error('Failed to get or create Marengo index');
    }
    return result;
  };

  const createLanguageModel = (modelId: TwelveLabsModelId): LanguageModelV2 => {
    let cachedIndexId: string | null = null;

    const model = new Proxy({} as TwelveLabsLanguageModel, {
      get(target, prop) {
        if (prop === 'doGenerate' || prop === 'doStream') {
          return async (...args: any[]) => {
            if (!cachedIndexId) {
              // Use appropriate index based on model
              if (modelId === 'pegasus1.2') {
                cachedIndexId = await getOrCreatePegasusIndex();
              } else if (modelId === 'marengo2.7') {
                cachedIndexId = await getOrCreateMarengoIndex();
              } else {
                throw new Error(`Unsupported model: ${modelId}`);
              }
            }
            const actualModel = new TwelveLabsLanguageModel(modelId, {
              client,
              indexId: cachedIndexId,
              modelId,
              headers: options.headers,
            });
            return (actualModel as any)[prop](...args);
          };
        }

        const tempModel = new TwelveLabsLanguageModel(modelId, {
          client,
          indexId: '',
          modelId,
          headers: options.headers,
        });
        return (tempModel as any)[prop];
      },
    });

    return model as unknown as LanguageModelV2;
  };

  const createEmbeddingModel = (
    modelId: TwelveLabsEmbeddingModelId,
  ): EmbeddingModelV2<string> => {
    return new TwelveLabsEmbeddingModel(modelId, {
      client,
      modelId,
    });
  };

  const provider = (modelId: TwelveLabsModelId) => createLanguageModel(modelId);

  provider.languageModel = createLanguageModel;
  provider.chat = createLanguageModel;

  provider.embedding = createEmbeddingModel;
  provider.textEmbedding = createEmbeddingModel;
  provider.textEmbeddingModel = createEmbeddingModel;

  (provider as any).imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  return provider as TwelveLabsProvider;
}

/**
 * Default Twelve Labs provider instance.
 */
export const twelvelabs = createTwelveLabs();
