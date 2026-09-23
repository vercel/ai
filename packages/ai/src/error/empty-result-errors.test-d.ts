import type {
  Experimental_SpeechTranslationModelV4Usage,
  ImageModelV4ProviderMetadata,
  SharedV4ProviderMetadata,
} from '@ai-sdk/provider';
import { expectTypeOf, it } from 'vitest';
import type {
  Embedding,
  EmbeddingModelUsage,
  ImageModelUsage,
  LanguageModelUsage,
  ProviderMetadata,
} from '../types';
import type {
  NoEmbeddingGeneratedError,
  NoImageGeneratedError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  NoSpeechGeneratedError,
  NoTranscriptGeneratedError,
  NoTranslationGeneratedError,
  NoVideoGeneratedError,
} from './index';

it('exposes typed diagnostics for empty generation results', () => {
  expectTypeOf<NoEmbeddingGeneratedError['values']>().toEqualTypeOf<
    Array<string>
  >();
  expectTypeOf<NoEmbeddingGeneratedError['embeddings']>().toEqualTypeOf<
    Array<Embedding>
  >();
  expectTypeOf<NoEmbeddingGeneratedError['usage']>().toEqualTypeOf<
    EmbeddingModelUsage | undefined
  >();
  expectTypeOf<NoEmbeddingGeneratedError['providerMetadata']>().toEqualTypeOf<
    ProviderMetadata | undefined
  >();

  expectTypeOf<NoImageGeneratedError['usage']>().toEqualTypeOf<
    ImageModelUsage | undefined
  >();
  expectTypeOf<NoImageGeneratedError['providerMetadata']>().toEqualTypeOf<
    ImageModelV4ProviderMetadata | undefined
  >();

  expectTypeOf<NoObjectGeneratedError['providerMetadata']>().toEqualTypeOf<
    SharedV4ProviderMetadata | undefined
  >();
  expectTypeOf<NoOutputGeneratedError['usage']>().toEqualTypeOf<
    LanguageModelUsage | undefined
  >();
  expectTypeOf<NoOutputGeneratedError['providerMetadata']>().toEqualTypeOf<
    SharedV4ProviderMetadata | undefined
  >();
  expectTypeOf<NoSpeechGeneratedError['providerMetadata']>().toEqualTypeOf<
    SharedV4ProviderMetadata | undefined
  >();
  expectTypeOf<NoTranscriptGeneratedError['providerMetadata']>().toEqualTypeOf<
    SharedV4ProviderMetadata | undefined
  >();
  expectTypeOf<NoTranslationGeneratedError['usage']>().toEqualTypeOf<
    Experimental_SpeechTranslationModelV4Usage | undefined
  >();
  expectTypeOf<NoVideoGeneratedError['providerMetadata']>().toEqualTypeOf<
    SharedV4ProviderMetadata | undefined
  >();
});
