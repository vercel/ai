import { describe, expect, it } from 'vitest';
import { serializeForDevTools } from './serialize';

describe('serializeForDevTools', () => {
  it('preserves nested binary file data as base64', () => {
    const value = {
      type: 'content',
      value: [
        {
          type: 'file',
          mediaType: 'image/png',
          data: {
            type: 'data',
            data: new Uint8Array([137, 80, 78, 71]),
          },
        },
      ],
    };

    expect(JSON.parse(serializeForDevTools(value))).toEqual({
      type: 'content',
      value: [
        {
          type: 'file',
          mediaType: 'image/png',
          data: {
            type: 'data',
            data: 'iVBORw==',
          },
        },
      ],
    });
  });

  it('preserves URL and Date serialization', () => {
    expect(
      JSON.parse(
        serializeForDevTools({
          url: new URL('https://example.com/image.png'),
          timestamp: new Date('2026-07-29T00:00:00.000Z'),
        }),
      ),
    ).toEqual({
      url: 'https://example.com/image.png',
      timestamp: '2026-07-29T00:00:00.000Z',
    });
  });

  it('preserves prototype-defined toJSON behavior', () => {
    class RedactedValue {
      secret = 'token';

      toJSON() {
        return { redacted: true };
      }
    }

    expect(
      JSON.parse(
        serializeForDevTools({
          value: new RedactedValue(),
        }),
      ),
    ).toEqual({
      value: { redacted: true },
    });
  });

  it('retains normal JSON serialization for unrelated binary values', () => {
    const value = {
      bytes: new Uint8Array([1, 2]),
      buffer: new Uint8Array([3, 4]).buffer,
    };

    expect(serializeForDevTools(value)).toBe(JSON.stringify(value));
  });
});
