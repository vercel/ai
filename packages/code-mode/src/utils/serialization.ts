import { CodeModeError } from '../errors.js';

export function assertJsonSerializable(
  value: unknown,
  maxBytes: number,
  label: string,
): void {
  void toJsonPayload(value, maxBytes, label);
}

export function toJsonPayload(
  value: unknown,
  maxBytes: number,
  label: string,
): string {
  if (value === undefined) {
    return '';
  }

  return toStrictJsonPayload(value, maxBytes, label);
}

export function fromJsonPayload(valueJson: string): unknown {
  return valueJson === '' ? undefined : JSON.parse(valueJson);
}

export function toStrictJsonPayload(
  value: unknown,
  maxBytes: number,
  label: string,
): string {
  let encoded: string | undefined;
  try {
    encoded = JSON.stringify(value);
  } catch (error) {
    throw new CodeModeError(
      `${label} is not JSON-serializable: ${getErrorMessage(error)}`,
      'CODE_MODE_SERIALIZATION_ERROR',
    );
  }

  if (encoded === undefined) {
    throw new CodeModeError(
      `${label} is not JSON-serializable.`,
      'CODE_MODE_SERIALIZATION_ERROR',
    );
  }

  assertJsonPayloadSize(encoded, maxBytes, label);
  return encoded;
}

export function assertJsonPayloadSize(
  valueJson: string,
  maxBytes: number,
  label: string,
): void {
  const bytes = new TextEncoder().encode(valueJson).byteLength;
  if (bytes > maxBytes) {
    throw new CodeModeError(
      `${label} exceeds the ${maxBytes} byte size limit.`,
      'CODE_MODE_SERIALIZATION_ERROR',
      { bytes, maxBytes },
    );
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
