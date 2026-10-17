/**
 * Minimal RFC 8949 (CBOR) encoder/decoder for JSON-shaped data plus
 * `Uint8Array` byte strings.
 *
 * Deliberate subset (client and server are both ours):
 * - definite lengths only; no tags (major type 6); map keys must be text
 * - JSON parity: `toJSON` is honored (URL, Date), `undefined` object
 *   properties are dropped, `undefined` array elements become null
 * - byte strings decode to `Uint8Array` views over the input buffer
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// MARK: encode

export function encodeCbor(value: unknown): Uint8Array {
  const chunks: Uint8Array[] = [];
  encodeValue(value, chunks, new Set());
  let totalLength = 0;
  for (const chunk of chunks) totalLength += chunk.length;
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function pushByte(chunks: Uint8Array[], byte: number): void {
  chunks.push(Uint8Array.of(byte));
}

/** Writes a major-type header with the shortest-form length argument. */
function writeHeader(
  chunks: Uint8Array[],
  major: number,
  length: number,
): void {
  const head = major << 5;
  if (length < 24) {
    pushByte(chunks, head | length);
  } else if (length < 256) {
    chunks.push(Uint8Array.of(head | 24, length));
  } else if (length < 65536) {
    chunks.push(Uint8Array.of(head | 25, length >>> 8, length & 0xff));
  } else if (length < 4294967296) {
    const bytes = new Uint8Array(5);
    bytes[0] = head | 26;
    new DataView(bytes.buffer).setUint32(1, length);
    chunks.push(bytes);
  } else {
    const bytes = new Uint8Array(9);
    bytes[0] = head | 27;
    const view = new DataView(bytes.buffer);
    view.setUint32(1, Math.floor(length / 4294967296));
    view.setUint32(5, length % 4294967296);
    chunks.push(bytes);
  }
}

function encodeNumber(chunks: Uint8Array[], value: number): void {
  if (Number.isInteger(value) && Math.abs(value) < 2 ** 53) {
    writeHeader(chunks, value >= 0 ? 0 : 1, value >= 0 ? value : -1 - value);
    return;
  }
  const bytes = new Uint8Array(9);
  bytes[0] = 0xfb; // major 7, float64
  new DataView(bytes.buffer).setFloat64(1, value);
  chunks.push(bytes);
}

function encodeValue(
  value: unknown,
  chunks: Uint8Array[],
  seen: Set<object>,
): void {
  if (value === null || value === undefined) {
    // `undefined` reaches here only as an array element (object properties
    // are dropped by the caller), and JSON turns it into null.
    pushByte(chunks, 0xf6);
    return;
  }
  switch (typeof value) {
    case 'boolean':
      pushByte(chunks, value ? 0xf5 : 0xf4);
      return;
    case 'number':
      encodeNumber(chunks, value);
      return;
    case 'string': {
      const bytes = textEncoder.encode(value);
      writeHeader(chunks, 3, bytes.length);
      chunks.push(bytes);
      return;
    }
    case 'object':
      break;
    default:
      // bigint, function, symbol — JSON.stringify throws for bigint too
      throw new TypeError(`CBOR: cannot encode value of type ${typeof value}`);
  }

  if (value instanceof Uint8Array) {
    writeHeader(chunks, 2, value.length);
    chunks.push(value);
    return;
  }

  const toJSON = (value as { toJSON?: unknown }).toJSON;
  if (typeof toJSON === 'function') {
    encodeValue(toJSON.call(value), chunks, seen);
    return;
  }

  if (seen.has(value)) {
    throw new TypeError('CBOR: cannot encode circular reference');
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      writeHeader(chunks, 4, value.length);
      for (const item of value) {
        encodeValue(item, chunks, seen);
      }
    } else {
      const keys = Object.keys(value).filter(
        key => (value as Record<string, unknown>)[key] !== undefined,
      );
      writeHeader(chunks, 5, keys.length);
      for (const key of keys) {
        encodeValue(key, chunks, seen);
        encodeValue((value as Record<string, unknown>)[key], chunks, seen);
      }
    }
  } finally {
    seen.delete(value);
  }
}

// MARK: decode

type DecodeState = { pos: number };

export function decodeCbor(bytes: Uint8Array): unknown {
  const state: DecodeState = { pos: 0 };
  const value = readValue(bytes, state);
  if (state.pos !== bytes.length) {
    throw new SyntaxError('CBOR: trailing bytes after top-level value');
  }
  return value;
}

function readBytes(
  bytes: Uint8Array,
  state: DecodeState,
  count: number,
): Uint8Array {
  if (state.pos + count > bytes.length) {
    throw new SyntaxError('CBOR: unexpected end of input');
  }
  const slice = bytes.subarray(state.pos, state.pos + count);
  state.pos += count;
  return slice;
}

function readArgument(
  bytes: Uint8Array,
  state: DecodeState,
  info: number,
): number {
  if (info < 24) return info; // value is carried inline
  if (info > 27) {
    throw new SyntaxError(
      info === 31
        ? 'CBOR: indefinite lengths are not supported'
        : `CBOR: reserved additional information ${info}`,
    );
  }
  const width = 1 << (info - 24); // 24→1, 25→2, 26→4, 27→8
  if (state.pos + width > bytes.length) {
    throw new SyntaxError('CBOR: unexpected end of input');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset + state.pos, width);
  state.pos += width;
  if (width === 1) return view.getUint8(0);
  if (width === 2) return view.getUint16(0);
  if (width === 4) return view.getUint32(0);
  const value = view.getUint32(0) * 4294967296 + view.getUint32(4);
  if (value >= 2 ** 53) {
    throw new SyntaxError('CBOR: 64-bit integer exceeds 2^53');
  }
  return value;
}

function readLength(
  bytes: Uint8Array,
  state: DecodeState,
  info: number,
): number {
  return readArgument(bytes, state, info);
}

function decodeHalfFloat(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >> 10) & 0x1f;
  const fraction = bits & 0x3ff;
  if (exponent === 0) return sign * fraction * 2 ** -24;
  if (exponent === 31) return fraction === 0 ? sign * Infinity : NaN;
  return sign * (1 + fraction / 1024) * 2 ** (exponent - 15);
}

function readValue(bytes: Uint8Array, state: DecodeState): unknown {
  const initial = readBytes(bytes, state, 1)[0];
  const major = initial >> 5;
  const info = initial & 31;

  switch (major) {
    case 0:
      return readArgument(bytes, state, info);
    case 1:
      return -1 - readArgument(bytes, state, info);
    case 2: {
      const length = readLength(bytes, state, info);
      return readBytes(bytes, state, length);
    }
    case 3: {
      const length = readLength(bytes, state, info);
      return textDecoder.decode(readBytes(bytes, state, length));
    }
    case 4: {
      const length = readLength(bytes, state, info);
      const array: unknown[] = [];
      for (let i = 0; i < length; i++) {
        array.push(readValue(bytes, state));
      }
      return array;
    }
    case 5: {
      const length = readLength(bytes, state, info);
      const object: Record<string, unknown> = {};
      for (let i = 0; i < length; i++) {
        const key = readValue(bytes, state);
        if (typeof key !== 'string') {
          throw new SyntaxError('CBOR: map keys must be text strings');
        }
        object[key] = readValue(bytes, state);
      }
      return object;
    }
    case 6:
      throw new SyntaxError('CBOR: tags are not supported');
    case 7:
      switch (info) {
        case 20:
          return false;
        case 21:
          return true;
        case 22:
          return null;
        case 23:
          return undefined;
        case 25:
          return decodeHalfFloat(readArgument(bytes, state, info));
        case 26:
        case 27: {
          const width = info === 26 ? 4 : 8;
          if (state.pos + width > bytes.length) {
            throw new SyntaxError('CBOR: unexpected end of input');
          }
          const view = new DataView(
            bytes.buffer,
            bytes.byteOffset + state.pos,
            width,
          );
          state.pos += width;
          return info === 26 ? view.getFloat32(0) : view.getFloat64(0);
        }
        default:
          throw new SyntaxError(`CBOR: unsupported simple value ${info}`);
      }
  }
}
