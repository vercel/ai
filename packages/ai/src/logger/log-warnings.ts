import {
  ImageModelV2CallWarning,
  LanguageModelV2CallWarning,
  SpeechModelV2CallWarning,
  TranscriptionModelV2CallWarning,
} from '@ai-sdk/provider';

export type Warning =
  | LanguageModelV2CallWarning
  | ImageModelV2CallWarning
  | SpeechModelV2CallWarning
  | TranscriptionModelV2CallWarning;

export type LogWarningsFunction = (warnings: Warning[]) => void;

export const logWarnings: LogWarningsFunction = warnings => {
  const logger = globalThis.AI_SDK_LOG_WARNINGS;

  // if the logger is set to false, do nothing
  if (logger === false) {
    return;
  }

  // use the provided logger if it is a function
  if (typeof logger === 'function') {
    logger(warnings);
    return;
  }

  // default behavior: log warnings to the console
  for (const warning of warnings) {
    console.warn(JSON.stringify(warning, null, 2));
  }
};
