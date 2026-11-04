import { InvalidArgumentError } from '@ai-sdk/provider';
import { asSchema, jsonSchema, type FlexibleSchema } from './schema';
import { convertUint8ArrayToBase64 } from './uint8-utils';

/**
 * Streaming extraction of large base64 strings from a JSON response body.
 *
 * A JSON response that carries an image or a file is mostly one very long
 * base64 string. The regular pipeline (collect chunks, concatenate, decode to
 * text, `JSON.parse`, decode base64) holds about four copies of that string at
 * once. The scanner reads the body chunk by chunk instead: strings at the
 * configured paths are decoded to bytes while they stream in, and the text that
 * is handed to `JSON.parse` (the "skeleton") holds a short placeholder in their
 * place.
 *
 * - The skeleton is the original body except for the extracted strings, so
 *   `secureJsonParse` still sees every key (a base64 string cannot contain a
 *   quote, so it cannot hide one).
 * - A string is extracted only if it is canonical standard-alphabet base64
 *   (length divisible by 4, `=` only as the final padding, zero trailing bits,
 *   no escape sequences or whitespace). The bytes are then exactly what `atob`
 *   gives for it. Everything else stays a string. What was decoded before a
 *   string turned out not to qualify is encoded back, which gives the original
 *   characters.
 */

/** Strings that decode to fewer bytes stay strings. */
export const DEFAULT_BINARY_FIELD_MIN_BYTES = 64 * 1024;

/**
 * The compiled paths, a trie that is walked while scanning. The edges of a node
 * are the bytes of an object key (a key ends with its closing quote), `null`
 * for the items of an array, and `true` for "a path ends here".
 */
export type BinaryFieldPaths = Map<number | true | null, BinaryFieldPaths>;

const QUOTE = 0x22;
const BACKSLASH = 0x5c;
const EQUALS = 0x3d;
const COMMA = 0x2c;
const COLON = 0x3a;
const LEFT_BRACE = 0x7b;
const RIGHT_BRACE = 0x7d;
const LEFT_BRACKET = 0x5b;
const RIGHT_BRACKET = 0x5d;

// Where the scanner is.
const OUTSIDE = 0; // between tokens
const KEY = 1; // in an object key
const SKIP = 2; // in a string value that stays as it is
const BLOB = 3; // in a string value that is decoded while it streams in

/**
 * Compiles paths such as `images[*]` or `content[*].data.data`: plain object
 * keys (letters, digits, `_` and `-`) joined by `.`, and `[*]` for every
 * element of an array. Keys are compared with the raw bytes of the key in the
 * body, so a key written with an escape sequence never matches.
 */
export function compileBinaryFieldPaths(
  paths: readonly string[],
): BinaryFieldPaths {
  const root: BinaryFieldPaths = new Map();

  for (const path of paths) {
    if (!/^(?:[\w-]+|\[\*])(?:\.[\w-]+|\[\*])*$/.test(path)) {
      throw new InvalidArgumentError({
        argument: 'experimental_binaryFields',
        message: `Invalid binary field path "${path}"`,
      });
    }

    let node = root;
    for (const segment of path.match(/\[\*]|[\w-]+/g)!) {
      const edges =
        segment === '[*]' ? [null] : new TextEncoder().encode(`${segment}"`);
      for (const edge of edges) {
        let next = node.get(edge);
        if (next === undefined) {
          node.set(edge, (next = new Map()));
        }
        node = next;
      }
    }
    node.set(true, node);
  }

  return root;
}

export interface JsonBinaryFieldScanResult {
  /** The body with extracted strings replaced by placeholders. */
  text: string;
  /** The extracted bytes by the placeholder text that stands in for them. */
  binaries: ReadonlyMap<string, Uint8Array>;
}

function join(parts: Uint8Array[], length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }
  return bytes;
}

export function createJsonBinaryFieldScanner(
  paths: BinaryFieldPaths,
  minBytes = DEFAULT_BINARY_FIELD_MIN_BYTES,
) {
  // Six-bit value of each base64 character, 64 for everything else.
  const sextet = new Uint8Array(256).fill(64);
  for (let index = 0; index < 64; index++) {
    sextet[
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.charCodeAt(
        index,
      )
    ] = index;
  }
  const encoder = new TextEncoder();

  // The skeleton, as bytes: it is decoded once at the end, like the regular
  // path decodes the whole body.
  const pieces: Uint8Array[] = [];
  let piece = new Uint8Array(64 * 1024);
  let pieceLength = 0;
  let size = 0;
  const binaries = new Map<string, Uint8Array>();

  // JSON structure. Only the containers on a path get a frame; the ones that
  // are not are counted in `skipped`.
  //  - keys: the node whose edges match the next key; null in an array
  //  - next: the node of the value that is read next
  const frames: Array<{
    keys: BinaryFieldPaths | null;
    next?: BinaryFieldPaths;
  }> = [];
  let skipped = 0;
  let mode = OUTSIDE;
  let escaped = false;
  let last = 0; // the last `{`, `,` or `:` outside of strings
  let key: BinaryFieldPaths | undefined;

  // The candidate string: whole groups of four characters are decoded into
  // segments, the characters of an unfinished group are kept in `bits`.
  let segments: Uint8Array[] = [];
  let segment = new Uint8Array(0);
  let at = 0; // bytes used in `segment`
  let total = 0; // bytes decoded
  let bits = 0;
  let chars = 0; // characters in `bits`
  let padding = 0; // `=` characters seen

  const add = (bytes: Uint8Array) => {
    // Coalesce small fragments: retaining a buffer for each matched string
    // would make metadata grow with the number of values, even empty ones.
    for (let offset = 0; offset < bytes.length; ) {
      const length = Math.min(
        piece.length - pieceLength,
        bytes.length - offset,
      );
      piece.set(bytes.subarray(offset, offset + length), pieceLength);
      pieceLength += length;
      offset += length;
      size += length;
      if (pieceLength === piece.length) {
        pieces.push(piece);
        piece = new Uint8Array(64 * 1024);
        pieceLength = 0;
      }
    }
  };

  // Adds the part of a chunk to the skeleton. It is copied: a view on the
  // chunk would retain all of it.
  const emit = (chunk: Uint8Array, start: number, end: number) =>
    add(chunk.subarray(start, end));

  const reset = () => {
    segments = [];
    segment = new Uint8Array(0);
    at = 0;
    total = 0;
    bits = 0;
    chars = 0;
    padding = 0;
  };

  // Segments grow with the string, so that a short string does not pin a large
  // buffer.
  const grow = () => {
    if (at > 0) {
      segments.push(segment.subarray(0, at));
    }
    segment = new Uint8Array(Math.min(Math.max(total, 4096), 4 << 20));
    at = 0;
  };

  // The unfinished group, as bytes of a group of three padded with zeros.
  const rest = () => bits << ((4 - chars) * 6);

  // The string was not extracted: its characters go back into the skeleton.
  const restore = () => {
    for (const part of [...segments, segment.subarray(0, at)]) {
      add(encoder.encode(convertUint8ArrayToBase64(part)));
    }
    const group = rest();
    add(
      encoder.encode(
        convertUint8ArrayToBase64(
          Uint8Array.of(group >> 16, group >> 8, group),
        ).slice(0, chars) + '='.repeat(padding),
      ),
    );
    reset();
  };

  // The closing quote of a candidate string was reached.
  const closeBlob = () => {
    mode = OUTSIDE;
    const tail = chars && chars - 1;

    if (
      padding === (4 - chars) % 4 &&
      !(bits & ((1 << ((4 - chars) * 2)) - 1)) &&
      total + tail >= minBytes
    ) {
      const group = rest();
      const bytes = join([...segments, segment.subarray(0, at)], total + tail);
      for (let index = 0; index < tail; index++) {
        bytes[total + index] = group >> (16 - 8 * index);
      }
      const placeholder = `[binary data: ${bytes.length} bytes; ref ${crypto.getRandomValues(new Uint32Array(2)).join('-')}]`;
      binaries.set(placeholder, bytes);
      add(encoder.encode(placeholder));
      reset();
    } else {
      restore();
    }
  };

  const push = (chunk: Uint8Array) => {
    // The first byte of the chunk that is not in the skeleton yet.
    let from = 0;
    const { length } = chunk;

    for (let index = 0; index < length; index++) {
      let byte = chunk[index];

      if (mode === BLOB) {
        // The characters of the string, with the unfinished group in local
        // variables. The loop ends at the first byte that is not one.
        if (padding === 0) {
          let pending = bits;
          let count = chars;
          for (
            let value;
            index < length && (value = sextet[chunk[index]]) < 64;
            index++
          ) {
            pending = (pending << 6) | value;
            if (++count === 4) {
              if (at + 3 > segment.length) {
                grow();
              }
              segment[at++] = pending >> 16;
              segment[at++] = pending >> 8;
              segment[at++] = pending;
              total += 3;
              pending = 0;
              count = 0;
            }
          }
          bits = pending;
          chars = count;
        }

        if (index >= length) {
          break;
        }

        byte = chunk[index];
        if (byte === QUOTE) {
          closeBlob();
          from = index;
        } else if (byte === EQUALS && chars > 1 && padding < 4 - chars) {
          // Padding completes a group of two or three characters.
          padding++;
        } else {
          // Not canonical. The string goes on as a regular string, from this
          // byte.
          restore();
          mode = SKIP;
          from = index--;
        }
      } else if (mode !== OUTSIDE) {
        if (mode === KEY) {
          key = key?.get(byte);
        }
        if (escaped) {
          escaped = false;
        } else if (byte === BACKSLASH) {
          escaped = true;
        } else if (byte === QUOTE) {
          if (mode === KEY) {
            frames.at(-1)!.next = key;
          }
          mode = OUTSIDE;
        }
      } else if (byte === QUOTE) {
        const frame = frames.at(-1);
        if (skipped > 0) {
          mode = SKIP;
        } else if (frame?.keys && (last === LEFT_BRACE || last === COMMA)) {
          mode = KEY;
          key = frame.keys;
        } else if ((frame ? frame.next : paths)?.get(true)) {
          mode = BLOB;
          // The opening quote still belongs to the skeleton.
          emit(chunk, from, index + 1);
        } else {
          mode = SKIP;
        }
      } else if (byte === LEFT_BRACE || byte === LEFT_BRACKET) {
        last = byte;
        const frame = frames.at(-1);
        const node = skipped > 0 ? undefined : frame ? frame.next : paths;
        const items = node?.get(null);
        if (byte === LEFT_BRACE && node) {
          frames.push({ keys: node });
        } else if (byte === LEFT_BRACKET && items) {
          frames.push({ keys: null, next: items });
        } else {
          skipped++;
        }
      } else if (byte === RIGHT_BRACE || byte === RIGHT_BRACKET) {
        if (skipped > 0) {
          skipped--;
        } else {
          frames.pop();
        }
      } else if (byte === COMMA || byte === COLON) {
        last = byte;
      }
    }

    if (mode !== BLOB) {
      emit(chunk, from, length);
    }
  };

  const finish = (): JsonBinaryFieldScanResult => {
    // A body that ends inside a candidate string is returned as it was
    // received, so that the regular parser reports the truncation.
    if (mode === BLOB) {
      restore();
    }
    return {
      text: new TextDecoder().decode(
        join([...pieces, piece.subarray(0, pieceLength)], size),
      ),
      binaries,
    };
  };

  return { push, finish };
}

/**
 * Replaces the placeholders in a parsed value with the bytes they stand for.
 * Objects and arrays are copied, the parsed value is not modified. A
 * placeholder holds a random number, so a string that equals one is ours.
 */
export function replaceBinaryFieldPlaceholders(
  value: unknown,
  binaries: ReadonlyMap<string, Uint8Array>,
): unknown {
  if (typeof value === 'string') {
    return binaries.get(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map(item => replaceBinaryFieldPlaceholders(item, binaries));
  }
  if (value != null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [
        name,
        replaceBinaryFieldPlaceholders(item, binaries),
      ]),
    );
  }
  return value;
}

/**
 * Makes `JSON.stringify` give the placeholder for each of the arrays, instead
 * of `{"0":…,"1":…}` with an entry for every byte: 24 MiB of bytes would
 * become a string of more than 300 MB. That is what a validator, or the code
 * that reports its issues, does with a value it puts into an error message.
 * The property is not enumerable, so the arrays look the same otherwise.
 * Returns the function that removes it again.
 */
function maskBinariesInJson(binaries: ReadonlyMap<string, Uint8Array>) {
  for (const [placeholder, bytes] of binaries) {
    Object.defineProperty(bytes, 'toJSON', {
      value: () => placeholder,
      configurable: true,
    });
  }

  return () => {
    for (const bytes of binaries.values()) {
      Reflect.deleteProperty(bytes, 'toJSON');
    }
  };
}

/**
 * Wraps a schema so that it validates the extracted bytes in place of their
 * placeholders. The value parsed from the skeleton, and the value of the
 * validation error of the response, keep the placeholders: reporting an error
 * never prints the bytes.
 *
 * The errors of the schema itself may hold the bytes: a Standard Schema
 * validator wraps the value it was given into an error, and the issues it
 * reports may carry the offending input. So that their messages do not grow
 * with the image, the arrays stringify as their placeholders, and keep doing
 * so as long as an error can refer to them. When the validation succeeds the
 * arrays are plain again, for whoever receives them.
 */
export function withBinaryFields<T>(
  schema: FlexibleSchema<T>,
  binaries: ReadonlyMap<string, Uint8Array>,
): FlexibleSchema<T> {
  if (binaries.size === 0) {
    return schema;
  }

  const actualSchema = asSchema(schema);

  return jsonSchema<T>(
    {},
    {
      validate: async value => {
        const replaced = replaceBinaryFieldPlaceholders(value, binaries);
        const unmask = maskBinariesInJson(binaries);
        const result = actualSchema.validate
          ? await actualSchema.validate(replaced)
          : { success: true as const, value: replaced as T };
        if (result.success) {
          unmask();
        }
        return result;
      },
    },
  );
}
