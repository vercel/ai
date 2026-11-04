import type { SharedV4Warning } from '@ai-sdk/provider';
import type { GladiaTranscriptionModelOptions } from './gladia-transcription-model-options';

export type ResolvedLanguageConfig = {
  languages?: string[];
  codeSwitching?: boolean;
};

export function resolveLanguageConfig(
  options: GladiaTranscriptionModelOptions,
): ResolvedLanguageConfig | undefined {
  if (options.languageConfig != null) {
    return {
      languages: options.languageConfig.languages ?? undefined,
      codeSwitching: options.languageConfig.codeSwitching ?? undefined,
    };
  }

  const codeSwitching = options.enableCodeSwitching ?? undefined;
  const languages =
    codeSwitching === true && options.codeSwitchingConfig?.languages != null
      ? options.codeSwitchingConfig.languages
      : options.language != null
        ? [options.language]
        : options.detectLanguage
          ? []
          : undefined;

  return languages == null && codeSwitching == null
    ? undefined
    : { languages, codeSwitching };
}

export function resolveCustomVocabulary(
  options: GladiaTranscriptionModelOptions,
  warnings: SharedV4Warning[] = [],
): {
  customVocabulary?: boolean;
  vocabulary?: NonNullable<
    GladiaTranscriptionModelOptions['customVocabularyConfig']
  >['vocabulary'];
} {
  if (Array.isArray(options.customVocabulary)) {
    warnings.push({
      type: 'deprecated',
      setting: 'customVocabulary',
      message:
        'Use customVocabulary: true with customVocabularyConfig instead of an array.',
    });
    if (options.customVocabularyConfig?.vocabulary != null) {
      warnings.push({
        type: 'other',
        message:
          'customVocabularyConfig.vocabulary overrides the deprecated customVocabulary array.',
      });
      return { customVocabulary: true };
    }
    const vocabulary = options.customVocabulary.filter(
      item =>
        typeof item === 'string' ||
        (item != null &&
          typeof item === 'object' &&
          typeof item.value === 'string'),
    );
    if (vocabulary.length !== options.customVocabulary.length) {
      warnings.push({
        type: 'other',
        message:
          'Invalid customVocabulary entries were ignored; use strings or objects with a string value.',
      });
    }
    return { customVocabulary: true, vocabulary };
  }

  return {
    customVocabulary:
      typeof options.customVocabulary === 'boolean'
        ? options.customVocabulary
        : undefined,
  };
}
