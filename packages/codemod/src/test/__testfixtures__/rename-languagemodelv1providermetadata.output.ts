// @ts-nocheck
import { SharedV2ProviderMetadata } from '@ai-sdk/provider';
import { SharedV2ProviderMetadata as ProviderMeta } from '@ai-sdk/provider';
import {
  LanguageModelV1,
  SharedV2ProviderMetadata as LM1Meta,
} from '@ai-sdk/provider';

// Basic import and usage
function processMetadata(metadata: SharedV2ProviderMetadata): void {
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
function getMetadata(): SharedV2ProviderMetadata {
  return {} as SharedV2ProviderMetadata;
}

// Interface and type definitions
interface CustomProvider {
  metadata: SharedV2ProviderMetadata;
}

// Mixed with other packages (should not transform)
import { LanguageModelV1ProviderMetadata as OtherMeta } from 'other-package';
function testOtherPackage(meta: OtherMeta): void {
  console.log(meta);
}

// Array type usage
const mixedArray: (SharedV2ProviderMetadata | string)[] = [];

// Generic type usage
type ProviderConfig<T = SharedV2ProviderMetadata> = {
  data: T;
};
