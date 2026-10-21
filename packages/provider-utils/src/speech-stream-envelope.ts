import type {
  Experimental_SpeechModelV4StreamPart as SpeechModelV4StreamPart,
  JSONObject,
} from '@ai-sdk/provider';
import { isRecord } from './is-record';
import { secureJsonParse } from './secure-json-parse';
import { convertUint8ArrayToBase64 } from './uint8-utils';

/**
 * Experimental speech-stream WebSocket envelope (v1): the standard
 * serialization of `SpeechModelV4.doStream` over a WebSocket. Clients (e.g.
 * the `@ai-sdk/gateway` provider) encode with this module and servers (e.g.
 * AI Gateway) decode with it, so the two sides cannot drift.
 *
 * Envelope rules:
 *
 * 1. The client sends exactly one `speech-stream.start` TEXT frame first.
 * 2. Input text rides `speech-stream.text-delta` TEXT frames, in order.
 * 3. The client signals the end of the input text with the
 *    `speech-stream.text-done` TEXT frame; a plain close without it is an
 *    abort.
 * 4. Every server→client TEXT frame is one JSON-serialized
 *    `SpeechModelV4StreamPart` (flattened, no wrapper). `audio` payloads are
 *    base64 strings. `Date` values (`response-metadata.timestamp`) serialize
 *    to ISO 8601 strings and are revived by `parseSpeechStreamPart`. `Error`
 *    payloads in `error` parts serialize as `{ name, message }`.
 * 5. The server closes with code 1000 after the `finish` part; on failure it
 *    sends an `error` part and closes non-1000. A close without a prior
 *    `finish` is an error.
 * 6. Unknown frame/part types are ignored in both directions (forward
 *    compatibility).
 * 7. Servers may enforce a maximum frame size (the AI Gateway rejects frames
 *    over 256 KiB); clients should keep text-delta frames under 64 KiB.
 * 8. Connection establishment (URL, auth) is transport-specific and out of
 *    scope.
 *
 * The envelope validates frame shape only; server policy layers on top. Both
 * parsers use `secureJsonParse`, so frames carrying `__proto__` /
 * `constructor.prototype` keys are rejected rather than parsed.
 */

/** Type of the first client TEXT frame. */
export const SPEECH_STREAM_START_FRAME_TYPE = 'speech-stream.start';

/** Type of the client TEXT frame that carries one input text delta. */
export const SPEECH_STREAM_TEXT_DELTA_FRAME_TYPE = 'speech-stream.text-delta';

/** Type of the client TEXT frame that signals the end of the input text. */
export const SPEECH_STREAM_TEXT_DONE_FRAME_TYPE = 'speech-stream.text-done';

/**
 * The client's session start frame. Optional keys are omitted when undefined.
 */
export type SpeechStreamStartFrame = {
  type: typeof SPEECH_STREAM_START_FRAME_TYPE;
  voice?: string;
  outputFormat?: string;
  instructions?: string;
  speed?: number;
  language?: string;

  /** Provider-specific options, passed through verbatim. */
  providerOptions?: Record<string, JSONObject>;

  /** When true, the server should include `raw` parts in the stream. */
  includeRawChunks?: boolean;
};

/** A client frame carrying one input text delta. */
export type SpeechStreamTextDeltaFrame = {
  type: typeof SPEECH_STREAM_TEXT_DELTA_FRAME_TYPE;
  delta: string;
};

/** Server-side classification of a client TEXT frame. */
export type SpeechStreamClientFrame =
  | { type: 'start'; frame: SpeechStreamStartFrame }
  | { type: 'text-delta'; delta: string }
  | { type: 'text-done' }
  | {
      /** Malformed JSON or a recognized frame with an invalid shape. */
      type: 'invalid';
      message: string;
    }
  | {
      /** Unrecognized frame type; ignore for forward compatibility. */
      type: 'unknown';
    };

const optionalStartFrameFields = {
  instructions: 'string',
  language: 'string',
  outputFormat: 'string',
  speed: 'number',
  voice: 'string',
  includeRawChunks: 'boolean',
} as const;

/**
 * Server-side: parse a client TEXT frame. Validates envelope shape only and
 * rejects prototype-pollution payloads. Never throws.
 */
export function parseSpeechStreamClientFrame(
  text: string,
): SpeechStreamClientFrame {
  let value: unknown;
  try {
    value = secureJsonParse(text);
  } catch {
    return { type: 'invalid', message: 'malformed JSON' };
  }

  if (!isRecord(value)) {
    return { type: 'invalid', message: 'frame must be a JSON object' };
  }

  if (typeof value.type !== 'string') {
    return { type: 'invalid', message: 'frame type must be a string' };
  }

  switch (value.type) {
    case SPEECH_STREAM_START_FRAME_TYPE: {
      for (const [field, type] of Object.entries(optionalStartFrameFields)) {
        if (value[field] !== undefined && typeof value[field] !== type) {
          return {
            type: 'invalid',
            message: `${field} must be a ${type} when present`,
          };
        }
      }
      if (
        value.providerOptions !== undefined &&
        !isRecord(value.providerOptions)
      ) {
        return {
          type: 'invalid',
          message: 'providerOptions must be an object when present',
        };
      }
      return { type: 'start', frame: value as SpeechStreamStartFrame };
    }

    case SPEECH_STREAM_TEXT_DELTA_FRAME_TYPE:
      return typeof value.delta === 'string'
        ? { type: 'text-delta', delta: value.delta }
        : {
            type: 'invalid',
            message: 'text-delta frame must have a string delta',
          };

    case SPEECH_STREAM_TEXT_DONE_FRAME_TYPE:
      return { type: 'text-done' };

    default:
      return { type: 'unknown' };
  }
}

/**
 * Server-side: serialize a speech stream part as one TEXT frame. Binary audio
 * is base64-encoded and `Error` payloads serialize as `{ name, message }`.
 * Returns `undefined` for payloads that are not JSON-serializable; callers
 * drop the frame.
 */
export function serializeSpeechStreamPart(
  part: SpeechModelV4StreamPart,
): string | undefined {
  try {
    if (part.type === 'audio' && part.audio instanceof Uint8Array) {
      return JSON.stringify({
        ...part,
        audio: convertUint8ArrayToBase64(part.audio),
      });
    }
    if (part.type === 'error' && isError(part.error)) {
      return JSON.stringify({
        ...part,
        error: { name: part.error.name, message: part.error.message },
      });
    }
    return JSON.stringify(part);
  } catch {
    return undefined;
  }
}

// `instanceof` misses cross-realm Errors; the brand check does not.
function isError(value: unknown): value is Error {
  return (
    value instanceof Error ||
    Object.prototype.toString.call(value) === '[object Error]'
  );
}

/**
 * Client-side: parse a server TEXT frame into a speech stream part. Returns
 * `undefined` for malformed or unsafe JSON, unknown part types, and known
 * part types whose fields are missing or mistyped. Revives
 * `response-metadata.timestamp` to a `Date`.
 */
export function parseSpeechStreamPart(
  text: string,
): SpeechModelV4StreamPart | undefined {
  let value: unknown;
  try {
    value = secureJsonParse(text);
  } catch {
    return undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const part = value as SpeechModelV4StreamPart;

  switch (part.type) {
    case 'stream-start': {
      if (!Array.isArray(part.warnings)) {
        return undefined;
      }
      // Unknown warning types are dropped (forward compatibility); a known
      // type with a malformed shape invalidates the part.
      const warnings = part.warnings.filter(
        warning => !isUnknownWarningType(warning),
      );
      return warnings.every(isWarning) ? { ...part, warnings } : undefined;
    }

    case 'audio':
      return isString(part.audio) &&
        isAudioFormat(part.audioFormat) &&
        isOptional(part.id, isString) &&
        isOptional(part.providerMetadata, isRecord)
        ? part
        : undefined;

    case 'finish':
      return isOptional(part.usage, isUsage) &&
        isOptional(part.providerMetadata, isRecord)
        ? part
        : undefined;

    case 'response-metadata': {
      if (
        !(
          isOptional(part.modelId, isString) &&
          isOptional(part.headers, isRecord)
        )
      ) {
        return undefined;
      }
      const timestamp: unknown = part.timestamp;
      if (timestamp == null) {
        return { ...part, timestamp: undefined };
      }
      if (typeof timestamp !== 'string') {
        return undefined;
      }
      const revived = new Date(timestamp);
      return Number.isNaN(revived.getTime())
        ? undefined
        : { ...part, timestamp: revived };
    }

    case 'raw':
      return 'rawValue' in part ? part : undefined;

    case 'error':
      return 'error' in part ? part : undefined;

    default:
      return undefined;
  }
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isOptional(
  value: unknown,
  check: (value: unknown) => boolean,
): boolean {
  return value === undefined || check(value);
}

const knownWarningTypes = new Set([
  'compatibility',
  'deprecated',
  'other',
  'unsupported',
]);

function isUnknownWarningType(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.type) &&
    !knownWarningTypes.has(value.type)
  );
}

function isWarning(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  switch (value.type) {
    case 'compatibility':
    case 'unsupported':
      return isString(value.feature) && isOptional(value.details, isString);
    case 'deprecated':
      return isString(value.setting) && isString(value.message);
    case 'other':
      return isString(value.message);
    default:
      return false;
  }
}

function isAudioFormat(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.type) &&
    isOptional(value.rate, rate => typeof rate === 'number')
  );
}

function isUsage(value: unknown): boolean {
  return (
    isRecord(value) &&
    ['inputCharacters', 'inputTokens', 'outputTokens'].every(key =>
      isOptional(value[key], count => typeof count === 'number'),
    )
  );
}
