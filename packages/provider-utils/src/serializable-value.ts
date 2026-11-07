import {
  convertBase64ToUint8Array,
  convertUint8ArrayToBase64,
  isArrayBuffer,
  isUint8Array,
} from './uint8-utils';
import type { JSONValue, SerializableValue } from '@ai-sdk/provider';

const tagKey = '__ai_sdk_serializable_value__';

type SerializableTag =
  | 'undefined'
  | 'bigint'
  | 'number'
  | 'date'
  | 'regexp'
  | 'url'
  | 'url-search-params'
  | 'array-buffer'
  | 'array-buffer-view'
  | 'map'
  | 'set'
  | 'object';

export function jsonEncodeSerializableValue(input: {
  value: SerializableValue;
}): JSONValue {
  return encodeValue({ value: input.value, ancestors: new WeakSet() });
}

export function jsonDecodeSerializableValue(input: {
  value: JSONValue;
}): SerializableValue {
  return decodeValue({ value: input.value, ancestors: new WeakSet() });
}

export function cloneSerializableValue(input: {
  value: SerializableValue;
}): SerializableValue {
  return cloneValue({ value: input.value, clones: new WeakMap() });
}

function encodeValue(input: {
  value: unknown;
  ancestors: WeakSet<object>;
}): JSONValue {
  const { value, ancestors } = input;

  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'number') {
    if (Number.isFinite(value) && !Object.is(value, -0)) return value;
    return tag({
      type: 'number',
      value: Number.isNaN(value)
        ? 'NaN'
        : value === Infinity
          ? 'Infinity'
          : value === -Infinity
            ? '-Infinity'
            : '-0',
    });
  }

  if (value === undefined) return tag({ type: 'undefined' });
  if (typeof value === 'bigint') {
    return tag({ type: 'bigint', value: value.toString() });
  }
  if (typeof value !== 'object') {
    throw new TypeError('Value cannot be represented as JSON.');
  }

  if (value instanceof Date) {
    const time = value.getTime();
    return tag({ type: 'date', value: Number.isNaN(time) ? null : time });
  }
  if (value instanceof RegExp) {
    return tag({
      type: 'regexp',
      value: {
        source: value.source,
        flags: value.flags,
        lastIndex: value.lastIndex,
      },
    });
  }
  if (value instanceof URL) {
    return tag({ type: 'url', value: value.href });
  }
  if (value instanceof URLSearchParams) {
    return tag({ type: 'url-search-params', value: value.toString() });
  }
  if (isArrayBuffer(value)) {
    return tag({
      type: 'array-buffer',
      value: convertUint8ArrayToBase64(new Uint8Array(value)),
    });
  }
  if (ArrayBuffer.isView(value)) {
    return tag({
      type: 'array-buffer-view',
      value: {
        name: getArrayBufferViewName({ value }),
        data: convertUint8ArrayToBase64(
          new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
        ),
      },
    });
  }

  return encodeContainer({
    value,
    ancestors,
    encode: () => {
      if (Array.isArray(value)) {
        return Array.from({ length: value.length }, (_, index) => {
          const descriptor = Object.getOwnPropertyDescriptor(
            value,
            String(index),
          );
          if (descriptor && !('value' in descriptor)) {
            throw new TypeError(
              'Accessor properties cannot be represented as JSON.',
            );
          }
          return encodeValue({
            value: descriptor?.value,
            ancestors,
          });
        });
      }

      if (value instanceof Map) {
        return tag({
          type: 'map',
          value: Array.from(value.entries(), ([key, entryValue]) => [
            encodeValue({ value: key, ancestors }),
            encodeValue({ value: entryValue, ancestors }),
          ]),
        });
      }

      if (value instanceof Set) {
        return tag({
          type: 'set',
          value: Array.from(value.values(), entryValue =>
            encodeValue({ value: entryValue, ancestors }),
          ),
        });
      }

      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError('Value cannot be represented as JSON.');
      }

      const entries: [string, JSONValue][] = [];
      for (const key of Reflect.ownKeys(value)) {
        if (typeof key !== 'string') {
          throw new TypeError(
            'Symbol-keyed properties cannot be represented as JSON.',
          );
        }

        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !('value' in descriptor)) {
          throw new TypeError(
            'Accessor properties cannot be represented as JSON.',
          );
        }
        entries.push([
          key,
          encodeValue({ value: descriptor.value, ancestors }),
        ]);
      }

      if (prototype === null || entries.some(([key]) => key === tagKey)) {
        return tag({
          type: 'object',
          value: {
            nullPrototype: prototype === null,
            entries,
          },
        });
      }

      const object: Record<string, JSONValue> = Object.create(null);
      for (const [key, entryValue] of entries) object[key] = entryValue;
      return object;
    },
  });
}

function decodeValue(input: {
  value: JSONValue | undefined;
  ancestors: WeakSet<object>;
}): SerializableValue {
  const { value, ancestors } = input;

  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number') return value;

  return decodeContainer({ value, ancestors });
}

function decodeContainer(input: {
  value: JSONValue | undefined;
  ancestors: WeakSet<object>;
}): SerializableValue {
  const { value, ancestors } = input;
  if (value === null || typeof value !== 'object') return value;

  return withAncestor({
    value,
    ancestors,
    callback: () => {
      if (Array.isArray(value)) {
        return value.map(item => decodeValue({ value: item, ancestors }));
      }

      if (Object.prototype.hasOwnProperty.call(value, tagKey)) {
        return decodeTag({
          value: value as Record<string, JSONValue>,
          ancestors,
        });
      }

      const result: Record<string, SerializableValue> = {};
      for (const [key, item] of Object.entries(value)) {
        Object.defineProperty(result, key, {
          configurable: true,
          enumerable: true,
          value: decodeValue({ value: item, ancestors }),
          writable: true,
        });
      }
      return result;
    },
  });
}

function decodeTag(input: {
  value: Record<string, JSONValue>;
  ancestors: WeakSet<object>;
}): SerializableValue {
  const { value, ancestors } = input;
  const type = value[tagKey];
  const payload = value.value;

  switch (type) {
    case 'undefined':
      return undefined;
    case 'bigint':
      if (typeof payload !== 'string') break;
      return BigInt(payload);
    case 'number':
      if (payload === 'NaN') return Number.NaN;
      if (payload === 'Infinity') return Infinity;
      if (payload === '-Infinity') return -Infinity;
      if (payload === '-0') return -0;
      break;
    case 'date':
      if (payload === null) return new Date(Number.NaN);
      if (typeof payload === 'number') return new Date(payload);
      break;
    case 'regexp':
      if (
        isJsonObject(payload) &&
        typeof payload.source === 'string' &&
        typeof payload.flags === 'string' &&
        typeof payload.lastIndex === 'number'
      ) {
        const regexp = new RegExp(payload.source, payload.flags);
        regexp.lastIndex = payload.lastIndex;
        return regexp;
      }
      break;
    case 'url':
      if (typeof payload === 'string') return new URL(payload);
      break;
    case 'url-search-params':
      if (typeof payload === 'string') return new URLSearchParams(payload);
      break;
    case 'array-buffer':
      if (typeof payload === 'string') {
        const bytes = convertBase64ToUint8Array(payload);
        return bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        );
      }
      break;
    case 'array-buffer-view':
      if (
        isJsonObject(payload) &&
        typeof payload.name === 'string' &&
        typeof payload.data === 'string'
      ) {
        return createArrayBufferView({
          name: payload.name,
          bytes: convertBase64ToUint8Array(payload.data),
        });
      }
      break;
    case 'map':
      if (Array.isArray(payload)) {
        return new Map(
          payload.map(entry => {
            if (!Array.isArray(entry) || entry.length !== 2) {
              throw new TypeError('Invalid serialized Map entry.');
            }
            return [
              decodeValue({ value: entry[0], ancestors }),
              decodeValue({ value: entry[1], ancestors }),
            ];
          }),
        );
      }
      break;
    case 'set':
      if (Array.isArray(payload)) {
        return new Set(
          payload.map(item => decodeValue({ value: item, ancestors })),
        );
      }
      break;
    case 'object':
      if (
        isJsonObject(payload) &&
        typeof payload.nullPrototype === 'boolean' &&
        Array.isArray(payload.entries)
      ) {
        const result = Object.create(
          payload.nullPrototype ? null : Object.prototype,
        ) as Record<string, SerializableValue>;
        for (const entry of payload.entries) {
          if (
            !Array.isArray(entry) ||
            entry.length !== 2 ||
            typeof entry[0] !== 'string'
          ) {
            throw new TypeError('Invalid serialized object entry.');
          }
          Object.defineProperty(result, entry[0], {
            configurable: true,
            enumerable: true,
            value: decodeValue({ value: entry[1], ancestors }),
            writable: true,
          });
        }
        return result;
      }
      break;
  }

  throw new TypeError('Invalid serialized SerializableValue.');
}

function cloneValue(input: {
  value: SerializableValue;
  clones: WeakMap<object, object>;
}): SerializableValue {
  const { value, clones } = input;
  if (value === null || typeof value !== 'object') return value;

  const existing = clones.get(value);
  if (existing) return existing as SerializableValue;

  if (value instanceof Date) {
    const clone = new Date(value);
    clones.set(value, clone);
    return clone;
  }
  if (value instanceof RegExp) {
    const clone = new RegExp(value.source, value.flags);
    clone.lastIndex = value.lastIndex;
    clones.set(value, clone);
    return clone;
  }
  if (value instanceof URL) {
    const clone = new URL(value.href);
    clones.set(value, clone);
    return clone;
  }
  if (value instanceof URLSearchParams) {
    const clone = new URLSearchParams(value);
    clones.set(value, clone);
    return clone;
  }
  if (isArrayBuffer(value)) {
    const clone = value.slice(0);
    clones.set(value, clone);
    return clone;
  }
  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(
      value.buffer,
      value.byteOffset,
      value.byteLength,
    ).slice();
    const clone = createArrayBufferView({
      name: getArrayBufferViewName({ value }),
      bytes,
    });
    clones.set(value, clone);
    return clone;
  }

  if (Array.isArray(value)) {
    const clone = new Array<SerializableValue>(value.length);
    clones.set(value, clone);
    for (let index = 0; index < value.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor) continue;
      if (!('value' in descriptor)) {
        throw new TypeError('Accessor properties cannot be cloned.');
      }
      Object.defineProperty(clone, String(index), {
        ...descriptor,
        value: cloneValue({ value: descriptor.value, clones }),
      });
    }
    return clone;
  }

  if (value instanceof Map) {
    const clone = new Map<SerializableValue, SerializableValue>();
    clones.set(value, clone);
    for (const [key, item] of value) {
      clone.set(
        cloneValue({ value: key, clones }),
        cloneValue({ value: item, clones }),
      );
    }
    return clone;
  }

  if (value instanceof Set) {
    const clone = new Set<SerializableValue>();
    clones.set(value, clone);
    for (const item of value) clone.add(cloneValue({ value: item, clones }));
    return clone;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Value cannot be cloned as a SerializableValue.');
  }

  const clone = Object.create(prototype) as Record<string, SerializableValue>;
  clones.set(value, clone);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') {
      throw new TypeError('Symbol-keyed properties cannot be cloned.');
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) {
      throw new TypeError('Accessor properties cannot be cloned.');
    }
    Object.defineProperty(clone, key, {
      ...descriptor,
      value: cloneValue({ value: descriptor.value, clones }),
    });
  }
  return clone;
}

function encodeContainer(input: {
  value: object;
  ancestors: WeakSet<object>;
  encode: () => JSONValue;
}): JSONValue {
  return withAncestor({
    value: input.value,
    ancestors: input.ancestors,
    callback: input.encode,
  });
}

function withAncestor<T>(input: {
  value: object;
  ancestors: WeakSet<object>;
  callback: () => T;
}): T {
  if (input.ancestors.has(input.value)) {
    throw new TypeError('Circular values cannot be represented as JSON.');
  }
  input.ancestors.add(input.value);
  try {
    return input.callback();
  } finally {
    input.ancestors.delete(input.value);
  }
}

function tag(input: { type: SerializableTag; value?: JSONValue }): JSONValue {
  const result: Record<string, JSONValue> = Object.create(null);
  result[tagKey] = input.type;
  if (input.value !== undefined) result.value = input.value;
  return result;
}

function isJsonObject(
  value: JSONValue | undefined,
): value is Record<string, JSONValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getArrayBufferViewName(input: { value: ArrayBufferView }): string {
  if (isUint8Array(input.value)) return 'Uint8Array';
  const name = Object.getPrototypeOf(input.value)?.constructor?.name;
  if (
    typeof name === 'string' &&
    [
      'DataView',
      'Int8Array',
      'Uint8ClampedArray',
      'Int16Array',
      'Uint16Array',
      'Int32Array',
      'Uint32Array',
      'Float32Array',
      'Float64Array',
      'BigInt64Array',
      'BigUint64Array',
    ].includes(name)
  ) {
    return name;
  }
  throw new TypeError('Unsupported ArrayBufferView type.');
}

function createArrayBufferView(input: {
  name: string;
  bytes: Uint8Array;
}): ArrayBufferView {
  const buffer = input.bytes.buffer.slice(
    input.bytes.byteOffset,
    input.bytes.byteOffset + input.bytes.byteLength,
  );
  switch (input.name) {
    case 'DataView':
      return new DataView(buffer);
    case 'Int8Array':
      return new Int8Array(buffer);
    case 'Uint8Array':
      return new Uint8Array(buffer);
    case 'Uint8ClampedArray':
      return new Uint8ClampedArray(buffer);
    case 'Int16Array':
      return new Int16Array(buffer);
    case 'Uint16Array':
      return new Uint16Array(buffer);
    case 'Int32Array':
      return new Int32Array(buffer);
    case 'Uint32Array':
      return new Uint32Array(buffer);
    case 'Float32Array':
      return new Float32Array(buffer);
    case 'Float64Array':
      return new Float64Array(buffer);
    case 'BigInt64Array':
      return new BigInt64Array(buffer);
    case 'BigUint64Array':
      return new BigUint64Array(buffer);
    default:
      throw new TypeError('Unsupported ArrayBufferView type.');
  }
}
