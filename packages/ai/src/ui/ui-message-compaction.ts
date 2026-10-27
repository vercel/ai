import type { JSONObject, JSONValue } from '@ai-sdk/provider';
import {
  convertUint8ArrayToBase64,
  type FilePart,
  type ModelMessage,
} from '@ai-sdk/provider-utils';
import { isValidMessages } from '../compact-messages/validate-compaction';
import { InvalidArgumentError } from '../error/invalid-argument-error';
import { convertToLanguageModelV4FilePart } from '../prompt/file-part-data';
import { jsonValueSchema } from '../types/json-value';
import { z, type ZodType } from '../util/zod';
import type { CompactionUIPart, UIMessage } from './ui-messages';

export const compactionUIPartSchema: ZodType<CompactionUIPart> = z.object({
  type: z.literal('compaction'),
  version: z.literal(1),
  replaces: z.object({
    messageId: z.string().min(1),
    messageCount: z.number().int().positive(),
    partCount: z.number().int().nonnegative(),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  messages: z.array(jsonValueSchema),
  checkpoint: z
    .object({
      version: z.literal(1),
      startIndex: z.number().int().nonnegative(),
      messageCount: z.number().int().positive(),
      digest: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .optional(),
});

/** Canonical JSON that rejects values JSON.stringify would silently corrupt. */
function toJSON(value: unknown, ancestors = new Set<object>()): JSONValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }

  if (typeof value !== 'object' || value == null || ancestors.has(value)) {
    throw new InvalidArgumentError({
      parameter: 'messages',
      value,
      message: 'Compaction messages must contain JSON-serializable values.',
    });
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return Array.from(value, item => toJSON(item, ancestors));
    }

    const prototype = Object.getPrototypeOf(value);
    if (
      (prototype !== Object.prototype && prototype !== null) ||
      Object.getOwnPropertySymbols(value).length > 0
    ) {
      throw new InvalidArgumentError({
        parameter: 'messages',
        value,
        message: 'Compaction messages must contain plain JSON objects.',
      });
    }

    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter(key => (value as Record<string, unknown>)[key] !== undefined)
        .map(key => [
          key,
          toJSON((value as Record<string, unknown>)[key], ancestors),
        ]),
    );
  } finally {
    ancestors.delete(value);
  }
}

/** Fingerprint UI history without presentation metadata or stream progress. */
export async function getUIMessageCompactionDigest(
  messages: readonly Omit<UIMessage, 'id'>[],
): Promise<string> {
  const serialized = JSON.stringify(
    toJSON(
      messages.map(message => ({
        ...('id' in message ? { id: message.id } : {}),
        role: message.role,
        parts: message.parts.map(part => {
          if (part.type === 'text' || part.type === 'reasoning') {
            const { state: _state, ...content } = part;
            return content;
          }
          if (part.type === 'dynamic-tool' && part.dynamic === false) {
            const {
              type: _type,
              dynamic: _dynamic,
              toolName,
              ...content
            } = part;
            // Validation represents unavailable historical static tools as
            // dynamic parts. This changes their UI type, not their history.
            return { ...content, type: `tool-${toolName}` };
          }
          return part;
        }),
      })),
    ),
  );
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(serialized),
  );
  return Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function serializeFileData(data: FilePart['data']) {
  const normalized = convertToLanguageModelV4FilePart(data);
  switch (normalized.data.type) {
    case 'data':
      return {
        ...normalized,
        data: {
          type: 'data',
          data:
            typeof normalized.data.data === 'string'
              ? normalized.data.data
              : convertUint8ArrayToBase64(normalized.data.data),
        },
      };
    case 'url':
      return {
        ...normalized,
        data: { ...normalized.data, url: normalized.data.url.href },
      };
    default:
      return normalized;
  }
}

function serializeContentPart(part: Record<string, unknown>): unknown {
  if (
    part.type === 'file' ||
    part.type === 'reasoning-file' ||
    part.type === 'image'
  ) {
    const { image, ...rest } = part;
    const normalized = serializeFileData(
      (part.type === 'image' ? image : part.data) as FilePart['data'],
    );
    return {
      ...rest,
      type: part.type === 'image' ? 'file' : part.type,
      data: normalized.data,
      mediaType: normalized.mediaType ?? part.mediaType ?? 'image',
    };
  }

  if (part.type === 'tool-result') {
    const output = part.output as Record<string, unknown>;
    if (output.type === 'content') {
      return {
        ...part,
        output: {
          ...output,
          value: (output.value as Record<string, unknown>[]).map(
            serializeContentPart,
          ),
        },
      };
    }
  }

  return part;
}

export async function serializeCompactionMessages(
  messages: readonly ModelMessage[],
): Promise<JSONValue[]> {
  if (!(await isValidMessages(messages))) {
    throw new InvalidArgumentError({
      parameter: 'replacementMessages',
      value: messages,
      message: 'Replacement messages must be valid model history.',
    });
  }

  const serialized = toJSON(
    messages.map(({ role, content, providerOptions }) => ({
      role,
      content:
        typeof content === 'string'
          ? content
          : content.map(part =>
              serializeContentPart(part as unknown as Record<string, unknown>),
            ),
      providerOptions,
    })),
  ) as JSONValue[];
  await deserializeCompactionMessages(serialized);
  return serialized;
}

function isJSONObject(value: JSONValue | undefined): value is JSONObject {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function deserializeContentPart(part: JSONValue): JSONValue | object {
  if (!isJSONObject(part)) {
    return part;
  }

  if (part.type === 'file' || part.type === 'reasoning-file') {
    const data = part.data;
    if (
      isJSONObject(data) &&
      data.type === 'url' &&
      typeof data.url === 'string'
    ) {
      return { ...part, data: { ...data, url: new URL(data.url) } };
    }
  }

  if (part.type === 'tool-result') {
    const output = part.output as JSONObject | undefined;
    if (output?.type === 'content' && Array.isArray(output.value)) {
      return {
        ...part,
        output: {
          ...output,
          value: output.value.map(deserializeContentPart),
        },
      };
    }
  }

  return part;
}

/** Restore only known file URL fields; arbitrary tool JSON stays JSON. */
export async function deserializeCompactionMessages(
  messages: JSONValue[],
): Promise<ModelMessage[]> {
  const cloned = toJSON(messages) as JSONValue[];
  const restored = cloned.map(message => {
    if (!isJSONObject(message)) {
      return message;
    }
    return {
      ...message,
      content: Array.isArray(message.content)
        ? message.content.map(deserializeContentPart)
        : message.content,
    };
  }) as ModelMessage[];

  if (!(await isValidMessages(restored))) {
    throw new InvalidArgumentError({
      parameter: 'messages',
      value: messages,
      message: 'Compaction replacement messages must be valid model history.',
    });
  }
  return restored;
}
