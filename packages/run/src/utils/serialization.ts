import { RunError } from '../errors.js';
import { RUN_SERDE, deserializeRunValue, serializeRunValue } from './serde.js';

export { RUN_SERDE };

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
  return toStrictJsonPayload(value, maxBytes, label);
}

export function normalizeJsonPayload(
  value: unknown,
  maxBytes: number,
  label: string,
): unknown {
  return parseJsonPayload(toJsonPayload(value, maxBytes, label), label);
}

export function parseJsonPayload(valueJson: string, label: string): unknown {
  try {
    return deserializeRunValue(valueJson);
  } catch (error) {
    throw new RunError(
      `${label} is not valid ${RUN_SERDE} data: ${getErrorMessage(error)}`,
      'RUN_SERIALIZATION_ERROR',
    );
  }
}

export function toStrictJsonPayload(
  value: unknown,
  maxBytes: number,
  label: string,
): string {
  let encoded: string | undefined;
  try {
    encoded = serializeRunValue(value);
  } catch (error) {
    const path = getSerializationPath(error);
    throw new RunError(
      `${label} is not serializable${path}: ${getErrorMessage(error)}`,
      'RUN_SERIALIZATION_ERROR',
    );
  }

  if (encoded === undefined) {
    throw new RunError(
      `${label} is not serializable.`,
      'RUN_SERIALIZATION_ERROR',
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
    throw new RunError(
      `${label} exceeds the ${maxBytes} byte size limit.`,
      'RUN_SERIALIZATION_ERROR',
      { bytes, maxBytes },
    );
  }
}

function getSerializationPath(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'path' in error &&
    typeof error.path === 'string' &&
    error.path.length > 0
  ) {
    return ` at ${error.path}`;
  }
  return '';
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
