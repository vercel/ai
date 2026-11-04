import { logWarnings } from '../logger/log-warnings';

const rawInputDeprecationWarning = {
  type: 'deprecated',
  setting: 'rawInput in output-error UI message parts',
  message:
    'Use the "input" field instead. The "rawInput" field will be removed in the next major version.',
} as const;

export function warnIfUIMessageHasDeprecatedRawInput(
  messages: ReadonlyArray<{
    parts: ReadonlyArray<unknown>;
  }>,
): void {
  const hasDeprecatedRawInput = messages.some(message =>
    message.parts.some(
      part =>
        part != null &&
        typeof part === 'object' &&
        'type' in part &&
        typeof part.type === 'string' &&
        (part.type === 'dynamic-tool' || part.type.startsWith('tool-')) &&
        'state' in part &&
        part.state === 'output-error' &&
        Object.prototype.hasOwnProperty.call(part, 'rawInput') &&
        'rawInput' in part &&
        part.rawInput !== undefined,
    ),
  );

  if (hasDeprecatedRawInput) {
    logWarnings({
      warnings: [rawInputDeprecationWarning],
    });
  }
}
