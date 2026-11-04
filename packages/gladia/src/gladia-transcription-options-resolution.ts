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
): {
  customVocabulary?: boolean;
  vocabulary?: NonNullable<
    GladiaTranscriptionModelOptions['customVocabularyConfig']
  >['vocabulary'];
} {
  if (Array.isArray(options.customVocabulary)) {
    return {
      customVocabulary: true,
      vocabulary: options.customVocabulary,
    };
  }

  return {
    customVocabulary:
      typeof options.customVocabulary === 'boolean'
        ? options.customVocabulary
        : undefined,
  };
}
