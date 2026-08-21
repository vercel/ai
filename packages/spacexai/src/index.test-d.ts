import { describe, expectTypeOf, it } from 'vitest';
import type {
  SpaceXAIFilesOptions,
  SpaceXAIImageModelOptions,
  SpaceXAILanguageModelChatOptions,
  SpaceXAILanguageModelResponsesOptions,
  SpaceXAIProvider,
  SpaceXAIProviderSettings,
  SpaceXAISpeechModelOptions,
  SpaceXAITranscriptionModelOptions,
  SpaceXAIVideoModelId,
  SpaceXAIVideoModelOptions,
  XaiFilesOptions,
  XaiImageModelOptions,
  XaiImageProviderOptions,
  XaiLanguageModelChatOptions,
  XaiLanguageModelResponsesOptions,
  XaiProvider,
  XaiProviderOptions,
  XaiProviderSettings,
  XaiResponsesProviderOptions,
  XaiSpeechModelOptions,
  XaiTranscriptionModelOptions,
  XaiVideoModelId,
  XaiVideoModelOptions,
  XaiVideoProviderOptions,
} from '.';

describe('deprecated public API aliases', () => {
  it('XaiProvider equals SpaceXAIProvider', () => {
    expectTypeOf<XaiProvider>().toEqualTypeOf<SpaceXAIProvider>();
  });

  it('XaiProviderSettings equals SpaceXAIProviderSettings', () => {
    expectTypeOf<XaiProviderSettings>().toEqualTypeOf<SpaceXAIProviderSettings>();
  });

  it('XaiLanguageModelChatOptions equals SpaceXAILanguageModelChatOptions', () => {
    expectTypeOf<XaiLanguageModelChatOptions>().toEqualTypeOf<SpaceXAILanguageModelChatOptions>();
  });

  it('XaiProviderOptions equals SpaceXAILanguageModelChatOptions', () => {
    expectTypeOf<XaiProviderOptions>().toEqualTypeOf<SpaceXAILanguageModelChatOptions>();
  });

  it('XaiLanguageModelResponsesOptions equals SpaceXAILanguageModelResponsesOptions', () => {
    expectTypeOf<XaiLanguageModelResponsesOptions>().toEqualTypeOf<SpaceXAILanguageModelResponsesOptions>();
  });

  it('XaiResponsesProviderOptions equals SpaceXAILanguageModelResponsesOptions', () => {
    expectTypeOf<XaiResponsesProviderOptions>().toEqualTypeOf<SpaceXAILanguageModelResponsesOptions>();
  });

  it('XaiImageModelOptions equals SpaceXAIImageModelOptions', () => {
    expectTypeOf<XaiImageModelOptions>().toEqualTypeOf<SpaceXAIImageModelOptions>();
  });

  it('XaiImageProviderOptions equals SpaceXAIImageModelOptions', () => {
    expectTypeOf<XaiImageProviderOptions>().toEqualTypeOf<SpaceXAIImageModelOptions>();
  });

  it('XaiVideoModelOptions equals SpaceXAIVideoModelOptions', () => {
    expectTypeOf<XaiVideoModelOptions>().toEqualTypeOf<SpaceXAIVideoModelOptions>();
  });

  it('XaiVideoProviderOptions equals SpaceXAIVideoModelOptions', () => {
    expectTypeOf<XaiVideoProviderOptions>().toEqualTypeOf<SpaceXAIVideoModelOptions>();
  });

  it('XaiVideoModelId equals SpaceXAIVideoModelId', () => {
    expectTypeOf<XaiVideoModelId>().toEqualTypeOf<SpaceXAIVideoModelId>();
  });

  it('XaiSpeechModelOptions equals SpaceXAISpeechModelOptions', () => {
    expectTypeOf<XaiSpeechModelOptions>().toEqualTypeOf<SpaceXAISpeechModelOptions>();
  });

  it('XaiTranscriptionModelOptions equals SpaceXAITranscriptionModelOptions', () => {
    expectTypeOf<XaiTranscriptionModelOptions>().toEqualTypeOf<SpaceXAITranscriptionModelOptions>();
  });

  it('XaiFilesOptions equals SpaceXAIFilesOptions', () => {
    expectTypeOf<XaiFilesOptions>().toEqualTypeOf<SpaceXAIFilesOptions>();
  });
});
