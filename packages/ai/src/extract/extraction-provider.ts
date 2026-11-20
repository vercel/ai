import type { Experimental_ExtractionModelV4 as ExtractionModelV4 } from '@ai-sdk/provider';

export type ExtractionProvider = {
  extractionModel?: (modelId: string) => ExtractionModelV4;
};
