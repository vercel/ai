import { NoSuchModelError } from '@ai-sdk/provider';

export const noSuchModel = (
  modelId: string,
  modelType:
    | 'languageModel'
    | 'embeddingModel'
    | 'imageModel'
    | 'transcriptionModel'
    | 'speechModel'
    | 'rerankingModel'
    | 'videoModel',
): never => {
  throw new NoSuchModelError({ modelId, modelType });
};
