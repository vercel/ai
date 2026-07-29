import { describe, expect, it } from 'vitest';
import { DefaultGeneratedFile } from 'ai';
import { serializeForDevTools } from '../../serialize';
import { findMediaPreviews } from './media';

describe('findMediaPreviews', () => {
  it('finds current file parts in nested tool output', () => {
    expect(
      findMediaPreviews({
        type: 'content',
        value: [
          {
            type: 'file',
            filename: 'screenshot.png',
            mediaType: 'image/png',
            data: { type: 'data', data: 'iVBORw==' },
          },
        ],
      }),
    ).toEqual([
      {
        filename: 'screenshot.png',
        kind: 'image',
        mediaType: 'image/png',
        source: 'data:image/png;base64,iVBORw==',
        sourceType: 'inline',
      },
    ]);
  });

  it('supports deprecated image and media aliases', () => {
    expect(
      findMediaPreviews([
        {
          type: 'image-url',
          url: 'https://example.com/screenshot.png',
        },
        {
          type: 'media',
          mediaType: 'audio/mpeg',
          data: 'SUQz',
        },
      ]),
    ).toEqual([
      {
        kind: 'image',
        mediaType: 'image',
        source: 'https://example.com/screenshot.png',
        sourceType: 'remote',
      },
      {
        kind: 'audio',
        mediaType: 'audio/mpeg',
        source: 'data:audio/mpeg;base64,SUQz',
        sourceType: 'inline',
      },
    ]);
  });

  it('detects the subtype for current top-level image media types', () => {
    expect(
      findMediaPreviews({
        type: 'file',
        mediaType: 'image',
        data: { type: 'data', data: 'iVBORw==' },
      }),
    ).toEqual([
      {
        kind: 'image',
        mediaType: 'image',
        source: 'data:image/png;base64,iVBORw==',
        sourceType: 'inline',
      },
    ]);
  });

  it('supports serialized generated file output', () => {
    const serializedValue = JSON.parse(
      serializeForDevTools({
        type: 'file',
        file: new DefaultGeneratedFile({
          data: new Uint8Array([137, 80, 78, 71]),
          mediaType: 'image/png',
        }),
      }),
    );

    expect(findMediaPreviews(serializedValue)).toEqual([
      {
        kind: 'image',
        mediaType: 'image/png',
        source: 'data:image/png;base64,iVBORw==',
        sourceType: 'inline',
      },
    ]);
  });

  it('does not expose malformed data, unsafe URL schemes, or executable inline images', () => {
    expect(
      findMediaPreviews([
        {
          type: 'image-url',
          url: 'javascript:alert(1)',
        },
        {
          type: 'file',
          mediaType: 'image/svg+xml',
          data: {
            type: 'data',
            data: 'PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIi8+',
          },
        },
        {
          type: 'file',
          mediaType: 'image/png',
          data: { type: 'data', data: 'not base64' },
        },
      ]),
    ).toEqual([
      {
        kind: 'image',
        mediaType: 'image',
      },
      {
        kind: 'image',
        mediaType: 'image/svg+xml',
      },
      {
        kind: 'image',
        mediaType: 'image/png',
      },
    ]);
  });

  it('limits inline preview size', () => {
    expect(
      findMediaPreviews(
        {
          type: 'file',
          mediaType: 'image/png',
          data: { type: 'data', data: 'iVBORw==' },
        },
        { maxInlineBytes: 3 },
      ),
    ).toEqual([
      {
        kind: 'image',
        mediaType: 'image/png',
        unavailableReason: 'Inline preview exceeds the 3-byte limit.',
      },
    ]);
  });

  it('limits preview count and traversal depth', () => {
    const media = {
      type: 'file',
      mediaType: 'image/png',
      data: { type: 'data', data: 'iVBORw==' },
    };

    expect(
      findMediaPreviews([media, media, media], { maxCount: 2 }),
    ).toHaveLength(2);
    expect(
      findMediaPreviews({ nested: { nested: media } }, { maxDepth: 1 }),
    ).toEqual([]);
  });

  it('handles cyclic values within the traversal limit', () => {
    const value: Record<string, unknown> = {};
    value.self = value;

    expect(findMediaPreviews(value)).toEqual([]);
  });
});
