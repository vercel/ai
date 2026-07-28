import type {
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

<<<<<<< HEAD
export const logWarnings: LogWarningsFunction = warnings => {
=======
function emitWarning({
  message,
  type,
}: {
  message: string;
  type: 'DeprecationWarning' | 'Warning';
}) {
  if (
    typeof process !== 'undefined' &&
    typeof process.emitWarning === 'function'
  ) {
    process.emitWarning(message, { type });
  } else {
    console.warn(message);
  }
}

/**
 * Logs warnings to the console or uses a custom logger if configured.
 *
 * The behavior can be customized via the `AI_SDK_LOG_WARNINGS` global variable:
 * - If set to `false`, warnings are suppressed.
 * - If set to a function, that function is called with the warnings.
 * - Otherwise, warnings are logged to the console using `console.warn`.
 *
 * @param options - The options containing warnings and context.
 * @param options.warnings - The warnings to log.
 * @param options.provider - The provider id used for the call, if scoped to a specific provider.
 * @param options.model - The model id used for the call, if scoped to a specific provider.
 */
export const logWarnings: LogWarningsFunction = options => {
>>>>>>> 2e2224b3c4 (fix: prevent the warning system banner from corrupting stdout output (#17973))
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
    emitWarning({
      message: FIRST_WARNING_INFO_MESSAGE,
      type: 'Warning',
    });
  }

<<<<<<< HEAD
  // default behavior: log warnings to the console
  for (const warning of warnings) {
    console.warn(formatWarning(warning));
=======
  // default behavior: log warnings via process.emitWarning if available, otherwise console.warn
  for (const warning of options.warnings) {
    const message = formatWarning({
      warning,
      provider: options.provider,
      model: options.model,
    });
    emitWarning({
      message,
      type: warning.type === 'deprecated' ? 'DeprecationWarning' : 'Warning',
    });
>>>>>>> 2e2224b3c4 (fix: prevent the warning system banner from corrupting stdout output (#17973))
  }
};

// Reset function for testing purposes
export const resetLogWarningsState = () => {
  hasLoggedBefore = false;
};
