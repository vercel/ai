import path from 'node:path';
import type { FxBuiltinToolOutput } from './fx-builtin-tools';

/**
 * A path given to one of fx's kernel tools, resolved on the sandbox.
 */
export type FxToolPath = {
  /**
   * Absolute path in the sandbox.
   */
  abs: string;

  /**
   * Path as fx shows it: relative to the working directory (`.` for the
   * working directory itself) when inside it, otherwise absolute.
   */
  rel: string;
};

/**
 * Returns how fx shows an absolute path: relative to the working directory
 * when inside it (`.` for the working directory itself), otherwise as is.
 */
export function toFxDisplayPath(options: {
  /**
   * Absolute path.
   */
  abs: string;

  /**
   * Working directory of the tools.
   */
  workDir: string;
}): string {
  const root = path.posix.resolve(options.workDir);
  const { abs } = options;
  if (abs === root) return '.';
  const prefix = root === '/' ? '/' : `${root}/`;
  return abs.startsWith(prefix) ? abs.slice(prefix.length) : abs;
}

/**
 * Resolves a path given to one of fx's kernel tools. A path may be relative
 * to the working directory, absolute, or start with `~`, which refers to the
 * sandbox user's home directory. No path is refused: the sandbox is the
 * boundary of what the tools can reach.
 */
export function resolveFxToolPath(options: {
  /**
   * Path given by the model.
   */
  path: string;

  /**
   * Working directory that relative paths resolve against.
   */
  workDir: string;

  /**
   * Home directory of the sandbox user.
   */
  home: string;
}): FxToolPath {
  const { workDir, home } = options;
  const given = options.path.trim();
  const expanded =
    given === '~'
      ? home
      : given.startsWith('~/')
        ? `${home}/${given.slice(2)}`
        : given;
  const abs = path.posix.resolve(workDir, expanded);
  return { abs, rel: toFxDisplayPath({ abs, workDir }) };
}

/**
 * Returns a tool error result with the given text.
 */
export function toFxToolError(options: {
  /**
   * Text shown to the model.
   */
  text: string;
}): FxBuiltinToolOutput {
  return { text: options.text, isError: true };
}

/**
 * Returns fx's structured tool failure (`tool_result_errors.zig`): a JSON
 * error object naming the tool, the failure and its details, with optional
 * recovery guidance for the model.
 */
export function toFxToolFailure(options: {
  /**
   * Name of the failed tool.
   */
  toolName: string;

  /**
   * Failure message.
   */
  message: string;

  /**
   * Details of the failure, e.g. the field and path involved.
   */
  details: Record<string, string>;

  /**
   * Recovery guidance for the model.
   */
  suggestion?: string;
}): FxBuiltinToolOutput {
  const { toolName, message, details, suggestion } = options;
  const error: {
    type: string;
    tool_name: string;
    message: string;
    details: Record<string, string>;
    suggestion?: string;
  } = {
    type: 'tool_execution_failed',
    tool_name: toolName,
    message,
    details,
  };
  if (suggestion != null) error.suggestion = suggestion;
  return toFxToolError({ text: JSON.stringify({ error }) });
}

/**
 * Validates an optional integer field of a tool input. Returns the value,
 * `undefined` when the field is absent, or a tool error result when the
 * value is not an integer of at least `min`.
 */
export function readFxIntegerField(options: {
  /**
   * Name of the tool.
   */
  toolName: string;

  /**
   * Name of the field.
   */
  field: string;

  /**
   * Value of the field.
   */
  value: unknown;

  /**
   * Smallest allowed value.
   */
  min: number;
}): number | undefined | FxBuiltinToolOutput {
  const { toolName, field, value, min } = options;
  if (value === undefined || value === null) return undefined;
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < min
  ) {
    return toFxToolError({
      text: `${toolName} field "${field}" must be a ${min > 0 ? 'positive' : 'non-negative'} integer`,
    });
  }
  return value;
}

/**
 * Returns whether a value is a tool result rather than a field value.
 */
export function isFxToolOutput(value: unknown): value is FxBuiltinToolOutput {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { text?: unknown }).text === 'string'
  );
}

const strictUtf8Decoder = new TextDecoder('utf-8', { fatal: true });

/**
 * Decodes bytes as fx's model-safe text: valid UTF-8 without NUL bytes.
 * Returns `undefined` for anything else, e.g. binary files.
 */
export function decodeFxModelSafeText(options: {
  /**
   * Bytes to decode.
   */
  bytes: Uint8Array;
}): string | undefined {
  const { bytes } = options;
  if (bytes.includes(0)) return undefined;
  try {
    return strictUtf8Decoder.decode(bytes);
  } catch {
    return undefined;
  }
}

/**
 * Returns the number of UTF-8 bytes of a string.
 */
export function getUtf8ByteLength(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

/**
 * Validates and resolves a path field of a tool input. Returns the resolved
 * path, or a tool error result when the value is not a non-empty string. An
 * absent optional field resolves to the working directory.
 */
export function resolveFxPathField(options: {
  /**
   * Name of the tool.
   */
  toolName: string;

  /**
   * Name of the field.
   */
  field: string;

  /**
   * Value of the field.
   */
  value: unknown;

  /**
   * Whether the field may be absent.
   */
  optional?: boolean;

  /**
   * Working directory that relative paths resolve against.
   */
  workDir: string;

  /**
   * Home directory of the sandbox user.
   */
  home: string;
}): FxToolPath | FxBuiltinToolOutput {
  const { toolName, field, value, optional = false, workDir, home } = options;
  if ((value === undefined || value === null) && optional) {
    return resolveFxToolPath({ path: '.', workDir, home });
  }
  if (typeof value !== 'string') {
    return toFxToolError({
      text: `${toolName} field "${field}" must be a string`,
    });
  }
  if (value.trim() === '') {
    return toFxToolError({
      text: `${toolName} field "${field}" must not be empty`,
    });
  }
  return resolveFxToolPath({ path: value, workDir, home });
}
