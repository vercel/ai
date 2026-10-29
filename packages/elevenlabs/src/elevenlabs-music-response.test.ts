import { describe, expect, it } from 'vitest';
import { createMusicTimestampsResponseHandler } from './elevenlabs-music-response';

const audio = new Uint8Array([
  255,
  0,
  128,
  13,
  10,
  ...new TextEncoder().encode('--music-boundary-extra'),
  0,
  255,
  13,
  10,
]);
const metadata = {
  words_timestamps: [{ word: 'Hello 🌍', start_ms: 120, end_ms: 945 }],
};

function multipart({
  json = JSON.stringify(metadata),
  audioPart = audio,
  reverse = false,
  close = true,
}: {
  json?: string | null;
  audioPart?: Uint8Array | null;
  reverse?: boolean;
  close?: boolean;
} = {}) {
  const parts: Buffer[] = [];
  if (json != null)
    parts.push(
      Buffer.from(
        `--music-boundary\r\nContent-Type: application/json\r\n\r\n${json}\r\n`,
      ),
    );
  if (audioPart != null)
    parts.push(
      Buffer.concat([
        Buffer.from(
          '--music-boundary\r\nContent-Type: audio/mpeg\r\nContent-Disposition: attachment; filename="music.mp3"\r\n\r\n',
        ),
        Buffer.from(audioPart),
        Buffer.from('\r\n'),
      ]),
    );
  if (reverse) parts.reverse();
  if (close) parts.push(Buffer.from('--music-boundary--\r\n'));
  return new Uint8Array(Buffer.concat(parts));
}

async function parse(
  body = multipart(),
  contentType = 'multipart/mixed; boundary=music-boundary',
) {
  return createMusicTimestampsResponseHandler()({
    response: new Response(body, {
      headers: { 'content-type': contentType, 'song-id': 'test-song' },
    }),
    url: 'https://api.elevenlabs.io/v1/music/detailed',
    requestBodyValues: {},
  });
}

describe('ElevenLabs music timestamp response', () => {
  it.each([false, true])(
    'preserves binary audio and lyric timings with reverse=%s',
    async reverse => {
      const result = await parse(multipart({ reverse }));
      expect(result.value).toStrictEqual({
        audio,
        wordTimestamps: [{ word: 'Hello 🌍', startMs: 120, endMs: 945 }],
      });
      expect(result.rawValue).toStrictEqual(metadata);
      expect(result.responseHeaders?.['song-id']).toBe('test-song');
    },
  );

  it('accepts a quoted boundary and case-insensitive content type', async () => {
    const result = await parse(
      multipart(),
      'Multipart/Mixed; boundary="music-boundary"; charset=utf-8',
    );
    expect(result.value.audio).toStrictEqual(audio);
  });

  it.each([{}, { words_timestamps: null }, { words_timestamps: [] }])(
    'handles optional lyric metadata: %j',
    async metadata => {
      const result = await parse(multipart({ json: JSON.stringify(metadata) }));
      expect(result.value.audio).toStrictEqual(audio);
      expect(result.value.wordTimestamps).toEqual(
        'words_timestamps' in metadata &&
          Array.isArray(metadata.words_timestamps)
          ? []
          : undefined,
      );
    },
  );

  it('preserves empty audio for core no-audio handling', async () => {
    expect(
      (await parse(multipart({ audioPart: new Uint8Array(0) }))).value.audio,
    ).toStrictEqual(new Uint8Array(0));
  });

  it.each([
    ['metadata', { json: null }],
    ['audio', { audioPart: null }],
    ['closing boundary', { close: false }],
  ] as const)('rejects a response missing %s', async (_, options) => {
    await expect(parse(multipart(options))).rejects.toThrow(
      'complete metadata and audio parts',
    );
  });

  it.each([
    'application/json',
    'multipart/mixed',
    'multipart/mixed; boundary="wrong"',
  ])('rejects invalid multipart content type %s', async contentType => {
    await expect(parse(multipart(), contentType)).rejects.toThrow();
  });

  it.each([
    '{',
    '{"words_timestamps":[{"word":"Hello","start_ms":"invalid","end_ms":1}]}',
  ])('rejects malformed lyric metadata: %s', async json => {
    await expect(parse(multipart({ json }))).rejects.toThrow();
  });
});
