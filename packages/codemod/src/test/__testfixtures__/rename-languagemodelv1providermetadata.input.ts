// @ts-nocheck
import { LanguageModelV1ProviderMetadata } from '@ai-sdk/provider';
import { LanguageModelV1ProviderMetadata as ProviderMeta } from '@ai-sdk/provider';
import {
  LanguageModelV1,
  LanguageModelV1ProviderMetadata as LM1Meta,
} from '@ai-sdk/provider';

// Basic import and usage
function processMetadata(metadata: LanguageModelV1ProviderMetadata): void {
  console.log(metadata);
}

// Aliased import usage
function processAlias(meta: ProviderMeta): void {
  console.log(meta);
}

// Multiple imports and complex type usage
const metadataArray: LM1Meta[] = [];
type MetadataOrString = LM1Meta | string;

// Function return type
function getMetadata(): LanguageModelV1ProviderMetadata {
  return {} as LanguageModelV1ProviderMetadata;
}

// Interface and type definitions
interface CustomProvider {
  metadata: LanguageModelV1ProviderMetadata;
}

// Mixed with other packages (should not transform)
import { LanguageModelV1ProviderMetadata as OtherMeta } from 'other-package';
function testOtherPackage(meta: OtherMeta): void {
  console.log(meta);
}

// Array type usage
const mixedArray: (LanguageModelV1ProviderMetadata | string)[] = [];

// Generic type usage
type ProviderConfig<T = LanguageModelV1ProviderMetadata> = {
  data: T;
};
