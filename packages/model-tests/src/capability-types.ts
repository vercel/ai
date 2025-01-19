import type {
  LanguageModelV1,
  ImageModelV1,
  EmbeddingModelV1,
} from '@ai-sdk/provider';

export type CapabilityModelType = {
  // Language model capabilities
  textCompletion: 'language';
  imageInput: 'language';
  objectGeneration: 'language';
  toolCalls: 'language';
  pdfInput: 'language';
  searchGrounding: 'language';
  languageModelErrorHandling: 'language';
  audioInput: 'language';

  // Image model capabilities
  imageGeneration: 'image';
  imageModelErrorHandling: 'image';

  // Embedding model capabilities
  embedding: 'embedding';
};

export type Capability = keyof CapabilityModelType;
export type ModelType = CapabilityModelType[Capability];
export type ModelCapabilities = Capability[];

export type ModelTypeMap = {
  language: LanguageModelV1;
  image: ImageModelV1;
  embedding: EmbeddingModelV1<string>;
};
