import {
  ImageModelV3CallWarning,
  LanguageModelV3CallWarning,
  SharedV3Warning,
  SpeechModelV3CallWarning,
  TranscriptionModelV3CallWarning,
} from '@ai-sdk/provider';

export type Warning =
  | LanguageModelV3CallWarning
  | ImageModelV3CallWarning
  | SpeechModelV3CallWarning
  | TranscriptionModelV3CallWarning
  | SharedV3Warning;

export type LogWarningsFunction = (options: {
  warnings: Warning[];
  provider: string;
  model: string;
}) => void;

/**
 * Formats a warning object into a human-readable string with clear AI SDK branding
 */
function formatWarning({
  warning,
  provider,
  model,
}: {
  warning: Warning;
  provider: string;
  model: string;
}): string {
  const prefix = `AI SDK Warning (${provider} / ${model}):`;

  switch (warning.type) {
    case 'unsupported-setting': {
      let message = `${prefix} The "${warning.setting}" setting is not supported.`;
      if (warning.details) {
        message += ` ${warning.details}`;
      }
      return message;
    }

    case 'compatibility': {
      let message = `${prefix} The "${warning.feature}" feature is not fully supported.`;
      if (warning.details) {
        message += ` ${warning.details}`;
      }
      return message;
    }

    case 'unsupported-tool': {
      const toolName =
        'name' in warning.tool ? warning.tool.name : 'unknown tool';
      let message = `${prefix} The tool "${toolName}" is not supported.`;
      if (warning.details) {
        message += ` ${warning.details}`;
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

export const logWarnings: LogWarningsFunction = options => {
  // if the warnings array is empty, do nothing
  if (options.warnings.length === 0) {
    return;
  }

  const logger = globalThis.AI_SDK_LOG_WARNINGS;

  // if the logger is set to false, do nothing
  if (logger === false) {
    return;
  }

  // use the provided logger if it is a function
  if (typeof logger === 'function') {
    logger(options);
    return;
  }

  // display information note on first call
  if (!hasLoggedBefore) {
    hasLoggedBefore = true;
    console.info(FIRST_WARNING_INFO_MESSAGE);
  }

  // default behavior: log warnings to the console
  for (const warning of options.warnings) {
    console.warn(
      formatWarning({
        warning,
        provider: options.provider,
        model: options.model,
      }),
    );
  }
};

// Reset function for testing purposes
export const resetLogWarningsState = () => {
  hasLoggedBefore = false;
};
