import { describe, expect, it } from 'vitest';
import type { ToolResultOutput } from '@ai-sdk/provider-utils';
import { HarnessCapabilityUnsupportedError } from '../errors/harness-capability-unsupported-error';
import { normalizeHarnessToolModelOutput } from './normalize-harness-tool-model-output';

const bytes = new Uint8Array([137, 80, 78, 71]);
const base64 = 'iVBORw==';
const normalize = (output: ToolResultOutput) =>
  normalizeHarnessToolModelOutput({ output });

describe('normalizeHarnessToolModelOutput', () => {
  it.each([base64, bytes, bytes.buffer])('normalizes inline data %s', data => {
    const output = normalize({
      type: 'content',
      value: [
        { type: 'text', text: 'before' },
        {
          type: 'file',
          mediaType: 'image',
          data: { type: 'data', data },
          providerOptions: { test: { detail: 'high' } },
        },
        { type: 'text', text: 'after' },
      ],
    });
    expect(output).toEqual({
      type: 'content',
      value: [
        { type: 'text', text: 'before' },
        {
          type: 'file',
          mediaType: 'image/png',
          data: { type: 'data', data: base64 },
          providerOptions: { test: { detail: 'high' } },
        },
        { type: 'text', text: 'after' },
      ],
    });
    expect(JSON.stringify(output)).not.toContain('137');
  });

  it.each(['image-data', 'file-data'] as const)(
    'normalizes legacy %s',
    type => {
      expect(
        normalize({
          type: 'content',
          value: [{ type, mediaType: 'image/*', data: base64 }],
        }),
      ).toEqual({
        type: 'content',
        value: [
          {
            type: 'file',
            mediaType: 'image/png',
            data: { type: 'data', data: base64 },
          },
        ],
      });
    },
  );

  it.each([
    { type: 'image-url', url: 'https://example.com/image.png' },
    { type: 'image-file-id', fileId: 'image-id' },
    {
      type: 'file',
      mediaType: 'image/png',
      data: { type: 'url', url: new URL('https://example.com/image.png') },
    },
    {
      type: 'file',
      mediaType: 'image/png',
      data: { type: 'reference', reference: { test: 'image-id' } },
    },
    {
      type: 'file',
      mediaType: 'audio/wav',
      data: { type: 'data', data: base64 },
    },
    { type: 'file', mediaType: 'image', data: { type: 'data', data: 'AAAA' } },
    { type: 'custom', providerOptions: {} },
  ] satisfies Extract<ToolResultOutput, { type: 'content' }>['value'])(
    'rejects unsupported $type',
    part => {
      expect(() => normalize({ type: 'content', value: [part] })).toThrow(
        HarnessCapabilityUnsupportedError,
      );
    },
  );

  it('does not mutate the callback output', () => {
    const output: ToolResultOutput = {
      type: 'content',
      value: [
        {
          type: 'file',
          mediaType: 'image',
          data: { type: 'data', data: bytes },
        },
      ],
    };
    normalize(output);
    expect(output.value[0]).toEqual({
      type: 'file',
      mediaType: 'image',
      data: { type: 'data', data: bytes },
    });
  });
});
