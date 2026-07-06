import { describe, expect, it } from 'vitest';
import {
  resolveCustomVocabulary,
  resolveLanguageConfig,
} from './gladia-transcription-options-resolution';

describe('resolveLanguageConfig', () => {
  it('returns undefined when no language options are provided', () => {
    expect(resolveLanguageConfig({})).toBeUndefined();
  });

  it('uses languageConfig when provided', () => {
    expect(
      resolveLanguageConfig({
        languageConfig: {
          languages: ['en'],
          codeSwitching: true,
        },
      }),
    ).toEqual({
      languages: ['en'],
      codeSwitching: true,
    });
  });

  it('maps deprecated language to languageConfig.languages', () => {
    expect(
      resolveLanguageConfig({
        language: 'en',
      }),
    ).toEqual({
      languages: ['en'],
      codeSwitching: undefined,
    });
  });

  it('maps deprecated code switching options', () => {
    expect(
      resolveLanguageConfig({
        enableCodeSwitching: true,
        codeSwitchingConfig: {
          languages: ['en', 'fr'],
        },
      }),
    ).toEqual({
      languages: ['en', 'fr'],
      codeSwitching: true,
    });
  });

  it('maps detectLanguage to an empty languages array', () => {
    expect(
      resolveLanguageConfig({
        detectLanguage: true,
      }),
    ).toEqual({
      languages: [],
      codeSwitching: undefined,
    });
  });

  it('prefers languageConfig over deprecated options', () => {
    expect(
      resolveLanguageConfig({
        language: 'en',
        languageConfig: {
          languages: ['de'],
        },
      }),
    ).toEqual({
      languages: ['de'],
      codeSwitching: undefined,
    });
  });
});

describe('resolveCustomVocabulary', () => {
  it('maps a vocabulary array to customVocabularyConfig vocabulary', () => {
    expect(
      resolveCustomVocabulary({
        customVocabulary: ['Gladia', 'AI SDK'],
      }),
    ).toEqual({
      customVocabulary: true,
      vocabulary: ['Gladia', 'AI SDK'],
    });
  });

  it('passes through boolean customVocabulary values', () => {
    expect(
      resolveCustomVocabulary({
        customVocabulary: true,
      }),
    ).toEqual({
      customVocabulary: true,
      vocabulary: undefined,
    });
  });
});
