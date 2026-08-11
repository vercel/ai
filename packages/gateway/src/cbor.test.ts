import { describe, expect, it } from 'vitest';
import { decodeCbor, encodeCbor } from './cbor';

function bytesFromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function hexOf(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

describe('decodeCbor', () => {
  // RFC 8949 Appendix A test vectors
  const vectors: Array<[string, unknown]> = [
    ['00', 0],
    ['01', 1],
    ['0a', 10],
    ['17', 23],
    ['1818', 24],
    ['1864', 100],
    ['1903e8', 1000],
    ['1a000f4240', 1000000],
    ['1b000000e8d4a51000', 1000000000000],
    ['20', -1],
    ['29', -10],
    ['3863', -100],
    ['3903e7', -1000],
    ['f9c400', -4],
    ['fbc010666666666666', -4.1],
    ['fa47c35000', 100000.0],
    ['fb7e37e43c8800759c', 1.0e300],
    ['f4', false],
    ['f5', true],
    ['f6', null],
    ['f7', undefined],
    ['60', ''],
    ['6161', 'a'],
    ['6449455446', 'IETF'],
    ['62c3bc', 'ü'],
    ['63e6b0b4', '水'],
    ['80', []],
    ['83010203', [1, 2, 3]],
    ['8301820203820405', [1, [2, 3], [4, 5]]],
    ['a0', {}],
    ['a26161016162820203', { a: 1, b: [2, 3] }],
    ['826161a161626163', ['a', { b: 'c' }]],
  ];

  it.each(vectors)('decodes %s', (hex, expected) => {
    expect(decodeCbor(bytesFromHex(hex))).toEqual(expected);
  });

  it('decodes NaN and infinities from half-float form', () => {
    expect(decodeCbor(bytesFromHex('f97e00'))).toBeNaN();
    expect(decodeCbor(bytesFromHex('f97c00'))).toBe(Infinity);
    expect(decodeCbor(bytesFromHex('f9fc00'))).toBe(-Infinity);
  });

  it('decodes byte strings to Uint8Array', () => {
    expect(decodeCbor(bytesFromHex('40'))).toEqual(new Uint8Array(0));
    expect(decodeCbor(bytesFromHex('4401020304'))).toEqual(
      new Uint8Array([1, 2, 3, 4]),
    );
  });

  it('rejects tags', () => {
    // tag 64 (RFC 8746 uint8 array) wrapping a byte string, as emitted by cbor-x
    expect(() => decodeCbor(bytesFromHex('d84043010203'))).toThrow(
      /tags are not supported/,
    );
  });

  it('rejects indefinite-length items', () => {
    expect(() => decodeCbor(bytesFromHex('9f0102ff'))).toThrow(/indefinite/);
    expect(() => decodeCbor(bytesFromHex('5f4100ff'))).toThrow(/indefinite/);
  });

  it('rejects non-string map keys', () => {
    expect(() => decodeCbor(bytesFromHex('a1010203'))).toThrow(/map keys/);
  });

  it('rejects truncated input and trailing bytes', () => {
    expect(() => decodeCbor(bytesFromHex('18'))).toThrow(/end of input/);
    expect(() => decodeCbor(bytesFromHex('44010203'))).toThrow(/end of input/);
    expect(() => decodeCbor(bytesFromHex('0000'))).toThrow(/trailing bytes/);
    expect(() => decodeCbor(new Uint8Array(0))).toThrow(/end of input/);
  });

  it('rejects integers beyond 2^53', () => {
    expect(() => decodeCbor(bytesFromHex('1bffffffffffffffff'))).toThrow(
      /2\^53/,
    );
  });
});

describe('encodeCbor', () => {
  const vectors: Array<[unknown, string]> = [
    [0, '00'],
    [1, '01'],
    [23, '17'],
    [24, '1818'],
    [255, '18ff'],
    [256, '190100'],
    [65535, '19ffff'],
    [65536, '1a00010000'],
    [4294967295, '1affffffff'],
    [4294967296, '1b0000000100000000'],
    [-1, '20'],
    [-24, '37'],
    [-25, '3818'],
    [1.5, 'fb3ff8000000000000'],
    [false, 'f4'],
    [true, 'f5'],
    [null, 'f6'],
    ['', '60'],
    ['a', '6161'],
    [[], '80'],
    [{}, 'a0'],
    [new Uint8Array(0), '40'],
    [new Uint8Array([1, 2, 3, 4]), '4401020304'],
  ];

  it.each(vectors)('encodes %j as %s', (value, hex) => {
    expect(hexOf(encodeCbor(value))).toBe(hex);
  });

  it('encodes strings as UTF-8', () => {
    expect(hexOf(encodeCbor('水'))).toBe('63e6b0b4');
  });

  it('drops undefined object properties (JSON parity)', () => {
    expect(hexOf(encodeCbor({ a: undefined, b: 1 }))).toBe('a1616201');
  });

  it('turns undefined array elements into null (JSON parity)', () => {
    expect(hexOf(encodeCbor([undefined, 1]))).toBe('82f601');
  });

  it('honors toJSON (URL, Date)', () => {
    expect(
      decodeCbor(encodeCbor({ url: new URL('https://example.com/a.png') })),
    ).toEqual({
      url: 'https://example.com/a.png',
    });
    expect(decodeCbor(encodeCbor({ d: new Date(0) }))).toEqual({
      d: '1970-01-01T00:00:00.000Z',
    });
  });

  it('throws on circular references', () => {
    const value: Record<string, unknown> = { a: 1 };
    value.self = value;
    expect(() => encodeCbor(value)).toThrow(/circular/);
  });

  it('throws on bigint and functions', () => {
    expect(() => encodeCbor(BigInt(1))).toThrow(/bigint/);
    expect(() => encodeCbor({ f: () => {} })).toThrow(/function/);
  });
});

describe('round-trip', () => {
  it('round-trips a spec-shaped payload with inline bytes at every nesting level', () => {
    const payload = {
      prompt: [
        { role: 'system', content: 'you are helpful' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'describe this 水 🚀' },
            {
              type: 'file',
              data: { type: 'data', data: new Uint8Array([137, 80, 78, 71]) },
              mediaType: 'image/png',
            },
            {
              type: 'file',
              data: { type: 'url', url: new URL('https://example.com/x.pdf') },
              mediaType: 'application/pdf',
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call_1',
              toolName: 'render',
              output: {
                type: 'content',
                value: [
                  {
                    type: 'file',
                    data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
                    mediaType: 'image/png',
                  },
                ],
              },
            },
          ],
        },
      ],
      maxOutputTokens: 4096,
      temperature: 0.7,
      includeRawChunks: false,
      providerOptions: {
        openai: { reasoningEffort: 'high', blob: new Uint8Array([9]) },
      },
    };

    const decoded = decodeCbor(encodeCbor(payload)) as any;

    expect(decoded.prompt[0]).toEqual(payload.prompt[0]);
    expect(decoded.prompt[1].content[0]).toEqual(payload.prompt[1].content[0]);
    const fileData = decoded.prompt[1].content[1].data;
    expect(fileData.type).toBe('data');
    expect(fileData.data).toBeInstanceOf(Uint8Array);
    expect(Array.from(fileData.data)).toEqual([137, 80, 78, 71]);
    // URL instances serialize like JSON (string href)
    expect(decoded.prompt[1].content[2].data).toEqual({
      type: 'url',
      url: 'https://example.com/x.pdf',
    });
    expect(
      Array.from(decoded.prompt[2].content[0].output.value[0].data.data),
    ).toEqual([1, 2, 3]);
    expect(Array.from(decoded.providerOptions.openai.blob)).toEqual([9]);
    expect(decoded.maxOutputTokens).toBe(4096);
    expect(decoded.temperature).toBe(0.7);
    expect(decoded.includeRawChunks).toBe(false);
  });

  it('round-trips NaN and infinities via float64', () => {
    const decoded = decodeCbor(encodeCbor([NaN, Infinity, -Infinity])) as any;
    expect(decoded[0]).toBeNaN();
    expect(decoded[1]).toBe(Infinity);
    expect(decoded[2]).toBe(-Infinity);
  });

  it('round-trips a large byte string', () => {
    const large = new Uint8Array(1024 * 1024);
    for (let i = 0; i < large.length; i++) large[i] = i % 251;
    const decoded = decodeCbor(encodeCbor({ blob: large })) as any;
    expect(decoded.blob).toBeInstanceOf(Uint8Array);
    expect(decoded.blob.length).toBe(large.length);
    expect(decoded.blob[12345]).toBe(large[12345]);
  });
});
