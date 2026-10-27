import { HarnessCapabilityUnsupportedError } from '../errors/harness-capability-unsupported-error';
import type { HarnessV1Prompt } from '../v1/harness-v1-prompt';
import { convertBase64ToUint8Array } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import {
  extractHarnessPromptContent,
  harnessPromptContentSchema,
} from './extract-harness-prompt-content';

const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const extract = (prompt: HarnessV1Prompt) =>
  extractHarnessPromptContent({ prompt });

describe('harnessPromptContentSchema', () => {
  it('accepts normalized text and image prompts', () => {
    for (const prompt of [
      'hello',
      [{ type: 'text', text: 'hello' }],
      [{ type: 'image', data: 'iVBORw0KGgo=', mediaType: 'image/png' }],
    ]) {
      expect(() => harnessPromptContentSchema.parse(prompt)).not.toThrow();
    }
  });

  it('rejects unsupported prompt content parts', () => {
    expect(() =>
      harnessPromptContentSchema.parse([{ type: 'audio', data: 'audio-data' }]),
    ).toThrow();
  });
});

describe('extractHarnessPromptContent', () => {
  it('preserves string prompts and string content', () => {
    expect(extract('hello')).toBe('hello');
    expect(extract({ role: 'user', content: 'hello' })).toBe('hello');
  });

  it('joins text-only parts with blank lines', () => {
    expect(
      extract({
        role: 'user',
        content: [
          { type: 'text', text: 'First' },
          { type: 'text', text: 'Second' },
        ],
      }),
    ).toBe('First\n\nSecond');
  });

  it('normalizes inline images and preserves content order', () => {
    expect(
      extract({
        role: 'user',
        content: [
          { type: 'text', text: 'Before' },
          {
            type: 'file',
            mediaType: 'image/png',
            data: { type: 'url', url: new URL(`data:image/png;base64,${png}`) },
          },
          {
            type: 'file',
            mediaType: 'image',
            data: { type: 'data', data: convertBase64ToUint8Array(png) },
          },
          { type: 'file', mediaType: 'image/png', data: png },
          { type: 'image', image: png },
          { type: 'text', text: 'After' },
        ],
      }),
    ).toEqual([
      { type: 'text', text: 'Before' },
      { type: 'image', mediaType: 'image/png', data: png },
      { type: 'image', mediaType: 'image/png', data: png },
      { type: 'image', mediaType: 'image/png', data: png },
      { type: 'image', mediaType: 'image/png', data: png },
      { type: 'text', text: 'After' },
    ]);
  });

  it.each([
    {
      name: 'remote image URLs',
      part: {
        type: 'file',
        mediaType: 'image/png',
        data: { type: 'url', url: new URL('https://example.com/a.png') },
      },
    },
    {
      name: 'provider references',
      part: {
        type: 'file',
        mediaType: 'image/png',
        data: { type: 'reference', reference: { test: 'file_1' } },
      },
    },
    {
      name: 'non-image files',
      part: {
        type: 'file',
        mediaType: 'application/pdf',
        data: { type: 'data', data: png },
      },
    },
    {
      name: 'data URLs that are not base64 encoded',
      part: {
        type: 'file',
        mediaType: 'image/svg+xml',
        data: new URL('data:image/svg+xml,%3Csvg%3E%3C/svg%3E'),
      },
    },
    {
      name: 'images whose media type cannot be detected',
      part: {
        type: 'file',
        mediaType: 'image',
        data: { type: 'data', data: 'aGVsbG8=' },
      },
    },
  ] as const)('rejects $name with a harness capability error', ({ part }) => {
    try {
      extract({ role: 'user', content: [part] });
      throw new Error('Expected prompt extraction to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(HarnessCapabilityUnsupportedError);
      expect((error as HarnessCapabilityUnsupportedError).message).toContain(
        'The harness layer does not support',
      );
    }
  });

  it('rejects unsupported content part types', () => {
    expect(() =>
      extract({
        role: 'user',
        content: [{ type: 'audio', data: 'audio-data' }],
      } as unknown as HarnessV1Prompt),
    ).toThrow(HarnessCapabilityUnsupportedError);
  });
});
