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

export const FIRST_WARNING_INFO_MESSAGE =
  'AI SDK Warning System: To turn off warning logging, set the AI_SDK_LOG_WARNINGS global to false.';

let hasLoggedBefore = false;

export const logWarnings: LogWarningsFunction = warnings => {
  // if the warnings array is empty, do nothing
  if (warnings.length === 0) {
    return;
  }

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

  // display information note on first call
  if (!hasLoggedBefore) {
    hasLoggedBefore = true;
    console.info(FIRST_WARNING_INFO_MESSAGE);
  }

  // default behavior: log warnings to the console
  for (const warning of warnings) {
    console.warn(JSON.stringify(warning, null, 2));
  }
};

// Reset function for testing purposes
export const resetLogWarningsState = () => {
  hasLoggedBefore = false;
};
