import { describe, expect, it } from 'vitest';
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

  it('does not expose unsafe URL schemes or executable inline images', () => {
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
    ]);
  });
});
