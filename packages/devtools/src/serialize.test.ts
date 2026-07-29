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
});
