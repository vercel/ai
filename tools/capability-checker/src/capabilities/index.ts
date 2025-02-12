import type { CapabilityModelType, ModelTypeMap } from '../types/capability';
import type { TestFunctionParams } from '../types/testing';
import * as textCompletion from './text-completion';
import * as audioInput from './audio-input';
import * as embedding from './embedding';
import * as languageModelErrorHandling from './language-model-error-handling';
import * as imageModelErrorHandling from './image-model-error-handling';
import * as imageGeneration from './image-generation';
import * as imageInput from './image-input';
import * as objectGeneration from './object-generation';
import * as toolCalls from './tool-calls';
import * as pdfInput from './pdf-input';
import * as searchGrounding from './search-grounding';

export type TestFunction<T extends keyof CapabilityModelType> = (
  params: TestFunctionParams<ModelTypeMap[CapabilityModelType[T]]> & {
    type: CapabilityModelType[T];
  },
) => void;

export const capabilityTests = {
  textCompletion,
  audioInput,
  embedding,
  imageGeneration,
  imageInput,
  languageModelErrorHandling,
  imageModelErrorHandling,
  objectGeneration,
  toolCalls,
  pdfInput,
  searchGrounding,
} as const satisfies {
  [K in keyof CapabilityModelType]: { run: TestFunction<K> };
};
