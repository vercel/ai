import type {
  LanguageModelV1,
  ImageModelV1,
  EmbeddingModelV1,
} from '@ai-sdk/provider';
import type { ModelCapabilities, Capability, ModelType } from './capability';

export type ModelTestOptions =
  | { type: 'language'; model: LanguageModelV1 }
  | { type: 'image'; model: ImageModelV1 }
  | { type: 'embedding'; model: EmbeddingModelV1<string> };

export interface ModelWithCapabilities<T> {
  model: T;
  capabilities?: ModelCapabilities;
}

export interface ModelVariants {
  language?: ModelWithCapabilities<LanguageModelV1>[];
  embedding?: ModelWithCapabilities<EmbeddingModelV1<string>>[];
  image?: ModelWithCapabilities<ImageModelV1>[];
}

export interface ModelConfig {
  provider: string;
  modelType: ModelType;
  modelId: string;
  variant?: string;
  expectedCapabilities: Capability[];
}
