import {
  ImageModelV3CallWarning,
  LanguageModelV3CallWarning,
  SpeechModelV3CallWarning,
  TranscriptionModelV3CallWarning,
} from '@ai-sdk/provider';

export type Warning =
  | LanguageModelV3CallWarning
  | ImageModelV3CallWarning
  | SpeechModelV3CallWarning
  | TranscriptionModelV3CallWarning;

export type LogWarningsFunction = (warnings: Warning[]) => void;

/**
 * Formats a warning object into a human-readable string with clear AI SDK branding
 */
function formatWarning(warning: Warning): string {
  const prefix = 'AI SDK Warning:';

  switch (warning.type) {
    case 'unsupported-setting': {
      let message = `${prefix} The "${warning.setting}" setting is not supported by this model`;
      if (warning.details) {
        message += ` - ${warning.details}`;
      }
      return message;
    }

    case 'unsupported-tool': {
      const toolName =
        'name' in warning.tool ? warning.tool.name : 'unknown tool';
      let message = `${prefix} The tool "${toolName}" is not supported by this model`;
      if (warning.details) {
        message += ` - ${warning.details}`;
      }
      return message;
    }

    case 'other': {
      return `${prefix} ${warning.message}`;
    }

    default: {
      // Fallback for any unknown warning types
      return `${prefix} ${JSON.stringify(warning, null, 2)}`;
    }
  }
}

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
    console.warn(formatWarning(warning));
  }
};

// Reset function for testing purposes
export const resetLogWarningsState = () => {
  hasLoggedBefore = false;
};
