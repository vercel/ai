import type { GladiaTranscriptionModelOptions } from './gladia-transcription-model-options';

export type ResolvedLanguageConfig = {
  languages?: string[];
  codeSwitching?: boolean;
};

export function resolveLanguageConfig(
  options: GladiaTranscriptionModelOptions,
): ResolvedLanguageConfig | undefined {
  const explicitConfig = options.languageConfig;
  let languages = explicitConfig?.languages;
  let codeSwitching = explicitConfig?.codeSwitching;

  if (languages == null && options.language != null) {
    languages = [options.language];
  }

  if (languages == null && options.codeSwitchingConfig?.languages != null) {
    languages = options.codeSwitchingConfig.languages;
  }

  if (languages == null && options.detectLanguage) {
    languages = [];
  }

  if (codeSwitching == null && options.enableCodeSwitching != null) {
    codeSwitching = options.enableCodeSwitching;
  }

  if (codeSwitching == null && options.codeSwitchingConfig != null) {
    codeSwitching = true;
  }

  if (languages == null && codeSwitching == null) {
    return undefined;
  }

  return {
    languages,
    codeSwitching,
  };
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
