import { InvalidArgumentError } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import {
  compileBinaryFieldPaths,
  createJsonBinaryFieldScanner,
  DEFAULT_BINARY_FIELD_MIN_BYTES,
  replaceBinaryFieldPlaceholders,
} from './json-binary-field-scanner';
import {
  convertBase64ToUint8Array,
  convertUint8ArrayToBase64,
} from './uint8-utils';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const IMAGES = ['images[*]'];
const FILES = ['content[*].data.data'];

// Chunk sizes that put chunk boundaries at every position of a group of four,
// around escape sequences, and far beyond the body.
const CHUNK_SIZES = [1, 2, 3, 4, 5, 7, 8, 13, 64, 1021, 64 * 1024];

function createRandom(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

function randomBytes(length: number, seed = 1): Uint8Array {
  const random = createRandom(seed);
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index++) {
    bytes[index] = Math.floor(random() * 256);
  }
  return bytes;
}

function base64Of(length: number, seed = 1): string {
  return convertUint8ArrayToBase64(randomBytes(length, seed));
}

function expectSameBytes(actual: Uint8Array | undefined, expected: Uint8Array) {
  expect(actual).toBeInstanceOf(Uint8Array);
  expect(actual?.length).toBe(expected.length);

  // Comparing element by element in a loop keeps large arrays fast.
  let firstDifference = -1;
  for (let index = 0; index < expected.length; index++) {
    if (actual![index] !== expected[index]) {
      firstDifference = index;
      break;
    }
  }
  expect(firstDifference).toBe(-1);
}

function split(bytes: Uint8Array, size: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let at = 0; at < bytes.length; at += size) {
    chunks.push(bytes.subarray(at, at + size));
  }
  return chunks;
}

function scan({
  body,
  paths = IMAGES,
  chunkSize = 64 * 1024,
  chunks,
  minBytes = 8,
}: {
  body: string | Uint8Array;
  paths?: string[];
  chunkSize?: number;
  chunks?: Uint8Array[];
  minBytes?: number;
}) {
  const bytes = typeof body === 'string' ? encoder.encode(body) : body;
  const scanner = createJsonBinaryFieldScanner(
    compileBinaryFieldPaths(paths),
    minBytes,
  );
  for (const chunk of chunks ?? split(bytes, chunkSize)) {
    scanner.push(chunk);
  }
  return scanner.finish();
}

function parseScanned({
  paths = IMAGES,
  ...options
}: Parameters<typeof scan>[0]): unknown {
  const { text, binaries } = scan({ paths, ...options });
  return replaceBinaryFieldPlaceholders(JSON.parse(text), binaries);
}

describe('compileBinaryFieldPaths', () => {
  it.each([
    'images[*]',
    'content[*].data.data',
    'a.b.c',
    'a[*][*]',
    '[*].data',
    'a-b_c.d9',
  ])('accepts %s', path => {
    expect(() => compileBinaryFieldPaths([path])).not.toThrow();
  });

  it.each([
    '',
    '.',
    'a.',
    '.a',
    'a..b',
    'a[0]',
    'a[*',
    'a[*]b',
    'a[*]bc',
    'a.b[*]c',
    '$.images[*]',
    'images[*].',
    'a b',
    'ключ',
    'a"b',
  ])('rejects %j', path => {
    expect(() => compileBinaryFieldPaths([path])).toThrow(InvalidArgumentError);
  });

  it('describes the problem and the path in the error', () => {
    expect(() => compileBinaryFieldPaths(['images[0]'])).toThrow(
      /Invalid binary field path "images\[0\]"/,
    );
  });
});

describe('createJsonBinaryFieldScanner', () => {
  describe('skeleton', () => {
    const bodies: Record<string, string | Uint8Array> = {
      'plain object': '{"a":1,"b":[true,false,null],"c":"text"}',
      'whitespace and newlines': '{\n  "a" : 1 ,\n  "b" : [ 1 , 2 ]\n}\n',
      'multi-byte characters':
        '{"text":"héllo wörld — ✓ 日本語 😀","k":"ключ"}',
      'escapes in strings': '{"a":"quote \\" backslash \\\\ slash \\/ nl \\n"}',
      'structural characters inside strings': '{"a":"{[,:]}","b":"\\"{\\""}',
      'empty body': '',
      'whitespace only': '  \n ',
      'lone string': '"just a string"',
      'invalid json': '{"a": [1, 2,, }',
      'byte order mark': new Uint8Array([
        0xef,
        0xbb,
        0xbf,
        ...encoder.encode('{"a":"b"}'),
      ]),
      'invalid utf-8': new Uint8Array([
        ...encoder.encode('{"a":"'),
        0xff,
        0xfe,
        ...encoder.encode('x"}'),
      ]),
      'truncated multi-byte sequence': new Uint8Array([
        ...encoder.encode('{"a":"'),
        0xe2,
        0x82,
      ]),
    };

    for (const [name, body] of Object.entries(bodies)) {
      it(`equals the decoded body at every chunk size: ${name}`, () => {
        const bytes = typeof body === 'string' ? encoder.encode(body) : body;
        const expected = decoder.decode(bytes);

        for (const chunkSize of CHUNK_SIZES) {
          const { text, binaries } = scan({ body: bytes, chunkSize });
          expect(text).toBe(expected);
          expect(binaries.size).toBe(0);
        }
      });
    }

    it('equals the decoded body for every split into three chunks', () => {
      const bytes = encoder.encode(
        '{"images":["QUJD","dà","x"],"a":{"images":["QUJD"]},"b":"\\\\\\""}',
      );
      const expected = decoder.decode(bytes);

      for (let first = 0; first <= bytes.length; first++) {
        for (let second = first; second <= bytes.length; second++) {
          const { text } = scan({
            body: bytes,
            chunks: [
              bytes.subarray(0, first),
              bytes.subarray(first, second),
              bytes.subarray(second),
            ],
          });
          expect(text).toBe(expected);
        }
      }
    });

    it('does not change a body without any path matches', () => {
      const body = JSON.stringify({
        images: base64Of(3000),
        content: [{ data: { data: base64Of(3000) } }],
      });

      const { text, binaries } = scan({ body, paths: ['other[*]'] });

      expect(text).toBe(body);
      expect(binaries.size).toBe(0);
    });
  });

  describe('extraction', () => {
    it('replaces a long base64 string with a placeholder and returns its bytes', () => {
      const bytes = randomBytes(5000);
      const body = JSON.stringify({
        images: [convertUint8ArrayToBase64(bytes)],
        warnings: [],
      });

      const { text, binaries } = scan({ body });

      expect(binaries.size).toBe(1);
      const [[placeholder, extracted]] = [...binaries];
      expect(extracted).toEqual(bytes);
      expect(JSON.parse(text)).toEqual({ images: [placeholder], warnings: [] });
      expect(placeholder).toMatch(/^\[binary data: 5000 bytes; ref \d+-\d+\]$/);
      expect(text.length).toBeLessThan(200);
    });

    it('extracts at every chunk size', () => {
      const bytes = randomBytes(1000, 7);
      const body = JSON.stringify({
        before: 'x'.repeat(10),
        images: [convertUint8ArrayToBase64(bytes)],
        after: { text: 'y' },
      });

      for (const chunkSize of CHUNK_SIZES) {
        const { text, binaries } = scan({ body, chunkSize });
        const [[placeholder, extracted]] = [...binaries];

        expect(extracted).toEqual(bytes);
        expect(JSON.parse(text)).toEqual({
          before: 'x'.repeat(10),
          images: [placeholder],
          after: { text: 'y' },
        });
      }
    });

    it('extracts every byte length, covering all padding variants', () => {
      for (let length = 8; length < 64; length++) {
        const bytes = randomBytes(length, length);
        const body = JSON.stringify({
          images: [convertUint8ArrayToBase64(bytes)],
        });

        for (const chunkSize of [1, 3, 5, 4096]) {
          const { binaries } = scan({ body, chunkSize });
          expect([...binaries.values()]).toEqual([bytes]);
        }
      }
    });

    it('returns the same bytes as the regular base64 decoding', () => {
      const base64 = base64Of(100_001, 3);

      const { binaries } = scan({
        body: JSON.stringify({ images: [base64] }),
        chunkSize: 4093,
      });

      expect(binaries.size).toBe(1);
      expectSameBytes(
        [...binaries.values()][0],
        convertBase64ToUint8Array(base64),
      );
    });

    it('handles strings around the sizes of the receiving segments', () => {
      // The receiving segments hold whole groups of three bytes, and every new
      // one is as large as all of the previous ones together (at least 4096
      // bytes): 4095, 4095, 8190, ... These are the cumulative sizes.
      const boundaries = [4095, 8190, 16_380, 32_760, 65_520];

      for (const boundary of boundaries) {
        for (const size of [
          boundary - 2,
          boundary - 1,
          boundary,
          boundary + 1,
          boundary + 2,
        ]) {
          const bytes = randomBytes(size, size);
          const { binaries } = scan({
            body: JSON.stringify({
              images: [convertUint8ArrayToBase64(bytes)],
            }),
            chunkSize: 65_536,
          });

          expect(binaries.size).toBe(1);
          expectSameBytes([...binaries.values()][0], bytes);
        }
      }
    });

    it('extracts several strings in order, each at its own path position', () => {
      const first = randomBytes(900, 1);
      const second = randomBytes(901, 2);
      const third = randomBytes(902, 3);
      const body = JSON.stringify({
        images: [
          convertUint8ArrayToBase64(first),
          convertUint8ArrayToBase64(second),
          convertUint8ArrayToBase64(third),
        ],
      });

      for (const chunkSize of [1, 7, 4096]) {
        expect(parseScanned({ body, chunkSize })).toEqual({
          images: [first, second, third],
        });
      }
    });

    it('extracts at nested paths', () => {
      const first = randomBytes(1200, 1);
      const second = randomBytes(1300, 2);
      const body = JSON.stringify({
        content: [
          { type: 'text', text: 'hello' },
          {
            type: 'file',
            mediaType: 'image/png',
            data: { type: 'data', data: convertUint8ArrayToBase64(first) },
          },
          {
            type: 'file',
            mediaType: 'image/png',
            data: { type: 'data', data: convertUint8ArrayToBase64(second) },
          },
          { type: 'file', data: { type: 'url', url: 'https://example.com' } },
        ],
        finishReason: { unified: 'stop' },
      });

      for (const chunkSize of [1, 5, 4096]) {
        expect(parseScanned({ body, paths: FILES, chunkSize })).toEqual({
          content: [
            { type: 'text', text: 'hello' },
            {
              type: 'file',
              mediaType: 'image/png',
              data: { type: 'data', data: first },
            },
            {
              type: 'file',
              mediaType: 'image/png',
              data: { type: 'data', data: second },
            },
            { type: 'file', data: { type: 'url', url: 'https://example.com' } },
          ],
          finishReason: { unified: 'stop' },
        });
      }
    });

    it('supports several paths and object-only paths', () => {
      const bytes = randomBytes(500, 4);
      const base64 = convertUint8ArrayToBase64(bytes);
      const body = JSON.stringify({ a: { b: base64 }, c: [base64], d: base64 });

      expect(
        parseScanned({ body, paths: ['a.b', 'c[*]'], chunkSize: 3 }),
      ).toEqual({ a: { b: bytes }, c: [bytes], d: base64 });
    });

    it('supports a root array', () => {
      const bytes = randomBytes(500, 4);
      const body = JSON.stringify([
        { data: convertUint8ArrayToBase64(bytes) },
        { data: 'x' },
      ]);

      expect(parseScanned({ body, paths: ['[*].data'], chunkSize: 5 })).toEqual(
        [{ data: bytes }, { data: 'x' }],
      );
    });

    it('keeps strings shorter than the minimum as strings', () => {
      const short = base64Of(100, 1);
      const long = base64Of(200, 2);
      const body = JSON.stringify({ images: [short, long, short] });

      for (const chunkSize of [1, 7, 4096]) {
        const { text, binaries } = scan({ body, minBytes: 150, chunkSize });
        expect(binaries.size).toBe(1);
        expect(
          replaceBinaryFieldPlaceholders(JSON.parse(text), binaries),
        ).toEqual({
          images: [short, convertBase64ToUint8Array(long), short],
        });
      }
    });

    it('uses the minimum on the decoded size, inclusive', () => {
      const base64 = base64Of(300);

      expect(
        scan({ body: JSON.stringify({ images: [base64] }), minBytes: 300 })
          .binaries.size,
      ).toBe(1);
      expect(
        scan({ body: JSON.stringify({ images: [base64] }), minBytes: 301 })
          .binaries.size,
      ).toBe(0);
    });

    it('counts padding characters towards the decoded size', () => {
      const body = JSON.stringify({ images: [base64Of(301)] });

      expect(scan({ body, minBytes: 301 }).binaries.size).toBe(1);
      expect(scan({ body, minBytes: 302 }).binaries.size).toBe(0);
    });

    it('defaults to a minimum of 64 KiB', () => {
      const run = (length: number) => {
        const scanner = createJsonBinaryFieldScanner(
          compileBinaryFieldPaths(IMAGES),
        );
        scanner.push(
          encoder.encode(JSON.stringify({ images: [base64Of(length)] })),
        );
        return scanner.finish().binaries.size;
      };

      expect(DEFAULT_BINARY_FIELD_MIN_BYTES).toBe(65_536);
      expect(run(65_535)).toBe(0);
      expect(run(65_536)).toBe(1);
    });

    it('does not retain the chunks it was given', () => {
      const bytes = randomBytes(2000, 3);
      const chunk = encoder.encode(
        JSON.stringify({
          before: 'kept text',
          images: [convertUint8ArrayToBase64(bytes)],
          after: 'also kept',
        }),
      );
      const scanner = createJsonBinaryFieldScanner(
        compileBinaryFieldPaths(IMAGES),
        8,
      );

      scanner.push(chunk);
      chunk.fill(0);
      const { text, binaries } = scanner.finish();

      expect([...binaries.values()]).toEqual([bytes]);
      expect(JSON.parse(text)).toEqual({
        before: 'kept text',
        images: [[...binaries.keys()][0]],
        after: 'also kept',
      });
    });

    it('returns arrays that own their whole buffer', () => {
      const bytes = randomBytes(5000, 3);
      const { binaries } = scan({
        body: JSON.stringify({
          images: [convertUint8ArrayToBase64(bytes), base64Of(70_000, 4)],
        }),
        chunkSize: 4093,
      });

      for (const extracted of binaries.values()) {
        expect(extracted.byteOffset).toBe(0);
        expect(extracted.buffer.byteLength).toBe(extracted.length);
      }
    });

    it('supports paths given in any order', () => {
      const first = randomBytes(600, 1);
      const second = randomBytes(700, 2);
      const body = JSON.stringify({
        images: [convertUint8ArrayToBase64(first)],
        content: [{ data: { data: convertUint8ArrayToBase64(second) } }],
      });
      const expected = {
        images: [first],
        content: [{ data: { data: second } }],
      };

      expect(parseScanned({ body, paths: [...FILES, ...IMAGES] })).toEqual(
        expected,
      );
      expect(parseScanned({ body, paths: [...IMAGES, ...FILES] })).toEqual(
        expected,
      );
    });
  });

  describe('strings that are not canonical base64 stay as they are', () => {
    const cases: Record<string, string> = {
      base64url: '"AB-_CDEFGHIJKLMNOP"',
      'data url': '"data:image/png;base64,QUJDREVGR0hJSktM"',
      'escaped slash': '"QUJD\\/EZH"',
      'unicode escape': '"QUJD\\u0045EZH"',
      'escaped quote': '"QUJDRU\\"EZH"',
      'escaped backslash': '"QUJDRU\\\\EZH"',
      'escaped newline': '"QUJDRUZH\\nSUpL"',
      space: '"QUJDRUZH SUpL"',
      'raw newline': '"QUJDRUZH\nSUpL"',
      'raw tab': '"QUJDRUZH\tSUpL"',
      'unpadded one': '"QUJDRUZHSUpLTA"',
      'unpadded two': '"QUJDRUZHSUpLT"',
      'length not divisible by four': '"QUJDRUZHSUpLTE1"',
      'single padding after two characters': '"QUJDRUZHSUpLTQ="',
      'triple padding': '"QUJDRUZHSUpLTQ==="',
      // One leftover character with zero bits: only the padding is wrong.
      'triple padding after one character': '"QUJDRUZHSUpLA==="',
      'padding in the middle': '"QUJD=UZHSUpLTE1O"',
      'double padding in the middle': '"QU==RUZHSUpLTE1O"',
      'data after padding': '"QUJDRUZHSUpLTQ==A"',
      'padding only': '"===="',
      'nonzero trailing bits with two paddings': '"QUJDRUZHSUpLTR=="',
      'nonzero trailing bits with one padding': '"QUJDRUZHSUpLTE1P="',
      'non-ascii character': '"QUJDRUZHSUpLTE1é"',
      'non-ascii in the middle': '"QUJDRéZHSUpLTE1O"',
      'nul character': '"QUJDRUZH\u0000SUpL"',
      'high byte': '"QUJDRUZH\u007fSUpL"',
    };

    for (const [name, literal] of Object.entries(cases)) {
      it(`leaves the text untouched: ${name}`, () => {
        const body = `{"images":[${literal}],"after":1}`;

        for (const chunkSize of CHUNK_SIZES) {
          const { text, binaries } = scan({ body, chunkSize, minBytes: 4 });

          expect(text).toBe(body);
          expect(binaries.size).toBe(0);
        }
      });
    }

    it('extracts strings that use the plus and slash characters', () => {
      const bytes = new Uint8Array([
        0xfb, 0xff, 0xbf, 0xfb, 0xef, 0xbe, 0x3e, 0x3f,
      ]);
      const base64 = convertUint8ArrayToBase64(bytes);

      expect(base64).toContain('+');
      expect(base64).toContain('/');
      expect(
        parseScanned({
          body: JSON.stringify({ images: [base64] }),
          chunkSize: 3,
        }),
      ).toEqual({
        images: [bytes],
      });
    });

    it('leaves a long non-canonical string untouched, even with a late offending character', () => {
      const long = base64Of(50_000, 5);

      for (const offender of [
        '-',
        '_',
        ' ',
        '\\n',
        '\\/',
        '\\u0041',
        '=A',
        '=',
      ]) {
        const literal = `"${long}${offender}"`;
        const body = `{"images":[${literal}],"after":[1]}`;

        for (const chunkSize of [1021, 8192]) {
          const { text, binaries } = scan({ body, chunkSize, minBytes: 100 });
          expect(text).toBe(body);
          expect(binaries.size).toBe(0);
        }
      }
    });

    it('extracts a canonical string next to non-canonical ones', () => {
      const bytes = randomBytes(600, 9);
      const body = JSON.stringify({
        images: [
          'AB-_CDEF',
          convertUint8ArrayToBase64(bytes),
          'data:x',
          5,
          null,
        ],
      });

      expect(parseScanned({ body, chunkSize: 5 })).toEqual({
        images: ['AB-_CDEF', bytes, 'data:x', 5, null],
      });
    });

    it('lets the regular parser report invalid JSON the same way', () => {
      const body = `{"images":["${base64Of(3000)}"`;

      const { text } = scan({ body, chunkSize: 11 });

      expect(text.startsWith('{"images":["[binary data: 3000 bytes;')).toBe(
        true,
      );
      expect(() => JSON.parse(text)).toThrow(SyntaxError);
      expect(() => JSON.parse(body)).toThrow(SyntaxError);
    });
  });

  describe('truncated bodies', () => {
    it('returns the received text when the body ends inside a candidate string', () => {
      const base64 = base64Of(500, 3);
      const body = `{"images":["${base64}","${base64}"]}`;
      const bytes = encoder.encode(body);

      for (let cut = 0; cut <= bytes.length; cut++) {
        for (const chunkSize of [1, 5, 64 * 1024]) {
          const truncated = bytes.subarray(0, cut);
          const { text, binaries } = scan({ body: truncated, chunkSize });
          const complete = [...binaries.keys()];
          let expected = decoder.decode(truncated);
          for (const placeholder of complete) {
            expect(text).toContain(placeholder);
            expected = expected.replace(base64, placeholder);
          }
          expect(text).toBe(expected);
        }
      }
    });
  });

  describe('paths', () => {
    const base64 = base64Of(600, 1);

    it.each([
      ['another key', { other: [base64] }],
      ['key with different case', { Images: [base64] }],
      ['longer key', { imagesX: [base64] }],
      ['shorter key', { image: [base64] }],
      ['nested below the path', { a: { images: [base64] } }],
      ['array of arrays', { images: [[base64]] }],
      ['object instead of array', { images: { a: base64 } }],
      ['string instead of array', { images: base64 }],
      ['array of objects', { images: [{ a: base64 }] }],
      ['sibling of the path', { images: [], x: base64 }],
    ])('does not extract: %s', (_name, document) => {
      const body = JSON.stringify(document);

      const { text, binaries } = scan({ body, chunkSize: 5 });

      expect(text).toBe(body);
      expect(binaries.size).toBe(0);
    });

    it('does not extract values at the wrong level of a nested path', () => {
      const body = JSON.stringify({
        content: [
          { data: base64 },
          { data: { other: base64 } },
          { data: { data: { data: base64 } } },
          { x: { data: { data: base64 } } },
          [{ data: { data: base64 } }],
        ],
        data: { data: base64 },
      });

      const { text, binaries } = scan({ body, paths: FILES });

      expect(text).toBe(body);
      expect(binaries.size).toBe(0);
    });

    it('does not match keys written with escape sequences', () => {
      for (const key of [
        '\\u0069mages',
        'im\\u0061ges',
        'images\\u0000',
        'im\\/ages',
        'images\\/',
        '\\/images',
        '\\imag',
      ]) {
        const body = `{"${key}":["${base64}"]}`;
        const { text, binaries } = scan({ body, chunkSize: 3 });

        expect(text).toBe(body);
        expect(binaries.size).toBe(0);
      }
    });

    it('does not match keys with non-ASCII bytes', () => {
      const body = `{"imagés":["${base64}"],"images ":["${base64}"]}`;

      const { text, binaries } = scan({ body, chunkSize: 3 });

      expect(text).toBe(body);
      expect(binaries.size).toBe(0);
    });

    it('does not mistake one key for a path of several keys or items', () => {
      const body = JSON.stringify({
        'a.b': base64,
        'a[*]': [base64],
        'x[*][*]': [[base64]],
      });

      const { text, binaries } = scan({
        body,
        paths: ['a.b', 'a[*]', 'x[*][*]'],
        chunkSize: 3,
      });

      expect(text).toBe(body);
      expect(binaries.size).toBe(0);
    });

    it('keeps scanning after a key with an escape sequence', () => {
      const bytes = randomBytes(600, 3);
      const body = `{"\\u0061":1,"a\\"b":2,"images":["${convertUint8ArrayToBase64(bytes)}"]}`;

      for (const chunkSize of [1, 3, 4096]) {
        expect(parseScanned({ body, chunkSize })).toEqual({
          a: 1,
          'a"b': 2,
          images: [bytes],
        });
      }
    });

    it('matches keys that contain structural characters in other keys', () => {
      const body = `{"a,b:c{d}[e]":1,"images":["${base64}"],"x\\"images":["${base64}"]}`;

      const { binaries } = scan({ body, chunkSize: 3 });

      expect(binaries.size).toBe(1);
    });

    it('lets the last of duplicate keys win, as JSON.parse does', () => {
      const bytes = randomBytes(600, 2);
      const encoded = convertUint8ArrayToBase64(bytes);

      expect(
        parseScanned({
          body: `{"images":["${base64}"],"images":["${encoded}"]}`,
          chunkSize: 7,
        }),
      ).toEqual({ images: [bytes] });

      expect(
        parseScanned({
          body: `{"images":["${base64}"],"images":["short"]}`,
          chunkSize: 7,
        }),
      ).toEqual({ images: ['short'] });

      expect(
        parseScanned({
          body: `{"images":["${base64}"],"images":[1]}`,
          chunkSize: 7,
        }),
      ).toEqual({ images: [1] });
    });

    it('extracts after structures that were skipped', () => {
      const bytes = randomBytes(600, 2);
      const encoded = convertUint8ArrayToBase64(bytes);
      const body = JSON.stringify({
        skipped: { deep: { deeper: { deepest: [{ images: [encoded] }] } } },
        images: [encoded],
        content: [{ meta: { x: [1, [2, [3]]] } }, { data: { data: encoded } }],
      });

      expect(
        parseScanned({ body, paths: [...IMAGES, ...FILES], chunkSize: 3 }),
      ).toEqual({
        skipped: { deep: { deeper: { deepest: [{ images: [encoded] }] } } },
        images: [bytes],
        content: [{ meta: { x: [1, [2, [3]]] } }, { data: { data: bytes } }],
      });
    });

    it('is not confused by structure in strings, escapes and chunk borders', () => {
      const bytes = randomBytes(600, 2);
      const encoded = convertUint8ArrayToBase64(bytes);
      const document = {
        a: '\\"}],"images":["x',
        b: '"',
        c: '\\',
        d: '\\\\"',
        images: [encoded, '"]', encoded],
      };
      const body = JSON.stringify(document);

      for (const chunkSize of CHUNK_SIZES) {
        expect(parseScanned({ body, chunkSize })).toEqual({
          ...document,
          images: [bytes, '"]', bytes],
        });
      }
    });

    it('survives nesting that is much deeper than any path', () => {
      const bytes = randomBytes(600, 2);
      const encoded = convertUint8ArrayToBase64(bytes);
      const depth = 50_000;
      const body = `{"deep":${'['.repeat(depth)}{"images":["${encoded}"]}${']'.repeat(depth)},"images":["${encoded}"]}`;

      const { text, binaries } = scan({ body, chunkSize: 4096 });

      expect(binaries.size).toBe(1);
      expect(text.length).toBeLessThan(body.length);
      expect(text.endsWith(']}')).toBe(true);
      expect(text).toContain(
        `"deep":${'['.repeat(depth)}{"images":["${encoded}"]}`,
      );
    });

    it('treats unbalanced closing brackets without failing', () => {
      const body = `]}]}{"images":["${base64Of(600)}"]}`;

      expect(() => scan({ body, chunkSize: 3 })).not.toThrow();
    });
  });

  describe('placeholders', () => {
    it('uses a different placeholder for every string and every scanner', () => {
      const body = JSON.stringify({ images: [base64Of(600), base64Of(600)] });

      const placeholders = [
        ...scan({ body }).binaries.keys(),
        ...scan({ body }).binaries.keys(),
      ];

      expect(placeholders).toHaveLength(4);
      expect(new Set(placeholders).size).toBe(4);
    });

    it('replaces placeholders with their bytes, and nothing else', () => {
      const body = JSON.stringify({ images: [base64Of(600)] });
      const { text, binaries } = scan({ body });
      const [[placeholder, bytes]] = [...binaries];
      const forged = placeholder.replace(/ref \d+-\d+/, 'ref 0-0');

      expect(JSON.parse(text)).toEqual({ images: [placeholder] });
      expect(
        replaceBinaryFieldPlaceholders(
          {
            images: [placeholder, forged, 'other', 1, null],
            deep: { list: [{ value: placeholder }] },
          },
          binaries,
        ),
      ).toEqual({
        images: [bytes, forged, 'other', 1, null],
        deep: { list: [{ value: bytes }] },
      });
    });

    it('does not modify the parsed value', () => {
      const body = JSON.stringify({
        images: [base64Of(600)],
        content: [{ data: { data: base64Of(600, 2), type: 'data' } }],
      });
      const { text, binaries } = scan({
        body,
        paths: [...IMAGES, ...FILES],
      });
      const parsed = JSON.parse(text);
      const snapshot = JSON.parse(text);

      const replaced = replaceBinaryFieldPlaceholders(parsed, binaries);

      expect(parsed).toEqual(snapshot);
      expect(replaced).not.toBe(parsed);
    });

    it('keeps an own __proto__ key an own key', () => {
      const parsed = JSON.parse('{"__proto__":["x"],"a":{"__proto__":"y"}}');

      const replaced = replaceBinaryFieldPlaceholders(
        parsed,
        new Map([['x', new Uint8Array(1)]]),
      ) as typeof parsed;

      expect(Object.getPrototypeOf(replaced)).toBe(Object.prototype);
      expect(Object.keys(replaced)).toEqual(['__proto__', 'a']);
      expect(
        Object.getOwnPropertyDescriptor(replaced, '__proto__')?.value,
      ).toEqual([new Uint8Array(1)]);
      expect(Object.getPrototypeOf(replaced.a)).toBe(Object.prototype);
    });
  });

  describe('differential test against JSON.parse and atob', () => {
    // Strings at the paths: canonical ones (checked with an independent oracle
    // below), and many ways to be almost canonical.
    function randomString(random: () => number): string {
      const roll = Math.floor(random() * 14);
      const length = Math.floor(random() * 60);
      const valid = base64Of(length, Math.floor(random() * 1e6) + 1);
      switch (roll) {
        case 0:
          return valid.replace(/=+$/, '');
        case 1:
          return `${valid}=`;
        case 2:
          return valid.length > 2
            ? `${valid.slice(0, 2)}-_${valid.slice(4)}`
            : '-';
        case 3:
          return `data:image/png;base64,${valid}`;
        case 4:
          return (
            valid.slice(0, Math.floor(valid.length / 2)) +
            '\n' +
            valid.slice(Math.floor(valid.length / 2))
          );
        case 5:
          return '';
        case 6:
          return 'é'.repeat(Math.floor(random() * 5));
        case 7:
          return valid.slice(0, -1) + (valid.endsWith('=') ? 'B' : '=');
        default:
          return valid;
      }
    }

    function randomDocument(random: () => number): unknown {
      const noise = (depth: number): unknown => {
        const roll = Math.floor(random() * 8);
        if (depth > 3 || roll < 3) {
          return [1, 'text', null, true, 'q"uote', '\\', 'é'][
            Math.floor(random() * 7)
          ];
        }
        if (roll < 5) {
          return Array.from({ length: Math.floor(random() * 3) }, () =>
            noise(depth + 1),
          );
        }
        const object: Record<string, unknown> = {};
        for (const key of [
          'images',
          'content',
          'data',
          'x',
          'Images',
          'type',
        ]) {
          if (random() < 0.4) {
            object[key] = noise(depth + 1);
          }
        }
        return object;
      };
      const field = () => (random() < 0.15 ? noise(1) : randomString(random));
      const document: Record<string, unknown> = {};
      if (random() < 0.8) {
        document.images = Array.from(
          { length: Math.floor(random() * 4) },
          field,
        );
      }
      if (random() < 0.8) {
        document.content = Array.from(
          { length: Math.floor(random() * 4) },
          () =>
            random() < 0.2
              ? noise(1)
              : {
                  type: 'file',
                  data:
                    random() < 0.15
                      ? noise(1)
                      : { type: 'data', data: field() },
                },
        );
      }
      if (random() < 0.5) {
        document.noise = noise(0);
      }
      return document;
    }

    // atob accepts more than canonical base64; re-encoding what it decoded only
    // reproduces the string if the string was canonical.
    function isCanonicalBase64(text: string): boolean {
      try {
        return btoa(atob(text)) === text;
      } catch {
        return false;
      }
    }

    function expectedValue(
      value: unknown,
      paths: string[][],
      minBytes: number,
    ): unknown {
      const visit = (current: unknown, level: string[][]): unknown => {
        if (typeof current === 'string') {
          return level.some(path => path.length === 0) &&
            isCanonicalBase64(current) &&
            atob(current).length >= minBytes
            ? convertBase64ToUint8Array(current)
            : current;
        }
        if (Array.isArray(current)) {
          const next = level
            .filter(path => path[0] === '*')
            .map(path => path.slice(1));
          return next.length === 0
            ? current
            : current.map(item => visit(item, next));
        }
        if (typeof current === 'object' && current !== null) {
          const result: Record<string, unknown> = { ...current };
          for (const key of Object.keys(result)) {
            const next = level
              .filter(path => path[0] === key)
              .map(path => path.slice(1));
            if (next.length > 0) {
              result[key] = visit(result[key], next);
            }
          }
          return result;
        }
        return current;
      };
      return visit(value, paths);
    }

    it('matches the reference implementation for random documents and chunkings', () => {
      const random = createRandom(20260101);
      const paths = [...IMAGES, ...FILES];
      const referencePaths = [
        ['images', '*'],
        ['content', '*', 'data', 'data'],
      ];

      for (let iteration = 0; iteration < 600; iteration++) {
        const document = randomDocument(random);
        const body =
          random() < 0.3
            ? JSON.stringify(document, null, 2)
            : JSON.stringify(document);
        const minBytes = [0, 1, 8, 20][Math.floor(random() * 4)];
        const chunkSize = [1, 2, 3, 5, 8, 13, 64, 4096][
          Math.floor(random() * 8)
        ];

        const expected = expectedValue(
          JSON.parse(body),
          referencePaths,
          minBytes,
        );
        const { text, binaries } = scan({ body, paths, chunkSize, minBytes });
        const actual = replaceBinaryFieldPlaceholders(
          JSON.parse(text),
          binaries,
        );

        expect(actual).toEqual(expected);

        // Writing the extracted strings back gives the original body.
        let restored = text;
        for (const [placeholder, bytes] of binaries) {
          restored = restored.replace(
            placeholder,
            convertUint8ArrayToBase64(bytes),
          );
        }
        expect(restored).toBe(body);
      }
    });

    it('produces random chunk boundaries independent of the result', () => {
      const random = createRandom(7);
      const paths = [...IMAGES, ...FILES];
      const document = {
        images: [base64Of(300, 1), 'x', base64Of(301, 2)],
        content: [
          { type: 'file', data: { type: 'data', data: base64Of(302, 3) } },
        ],
        noise: { a: ['é', '\\"', '{'] },
      };
      const bytes = encoder.encode(JSON.stringify(document));
      const reference = parseScanned({
        body: bytes,
        paths,
        chunkSize: bytes.length,
      });

      for (let iteration = 0; iteration < 200; iteration++) {
        const chunks: Uint8Array[] = [];
        for (let at = 0; at < bytes.length; ) {
          const size = 1 + Math.floor(random() * (random() < 0.8 ? 12 : 400));
          chunks.push(bytes.subarray(at, at + size));
          at += size;
        }

        expect(parseScanned({ body: bytes, paths, chunks })).toEqual(reference);
      }
    });
  });
});
