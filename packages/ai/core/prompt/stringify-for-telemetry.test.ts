import { describe, expect, it } from 'vitest';
import { stringifyForTelemetry } from './stringify-for-telemetry';
import { LanguageModelV2Prompt } from '@ai-sdk/provider';

describe('stringifyForTelemetry', () => {
  it('should stringify a prompt with text parts', () => {
    const prompt: LanguageModelV2Prompt = [
      { role: 'system', content: 'You are a helpful assistant.' },
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello!' }],
      },
    ];

    const result = stringifyForTelemetry(prompt);

    expect(result).toBe(JSON.stringify(prompt));
  });

  it('should convert Uint8Array images to base64 strings', () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0xff]);
    const base64Data = 'data:image/png;base64,iVBOR///';
    const prompt: LanguageModelV2Prompt = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Check this image:' },
          { type: 'file', data: pngBytes, mediaType: 'image/png' },
        ],
      },
    ];

    const expected = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Check this image:' },
          { type: 'file', data: base64Data, mediaType: 'image/png' },
        ],
      },
    ];

    const result = stringifyForTelemetry(prompt);

    expect(result).toBe(JSON.stringify(expected));
  });

  it('should preserve the file name and provider options', () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0xff]);
    const base64Data = 'data:image/png;base64,iVBOR///';
    const prompt: LanguageModelV2Prompt = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Check this image:' },
          {
            type: 'file',
            filename: 'image.png',
            data: pngBytes,
            mediaType: 'image/png',
            providerOptions: {
              anthropic: {
                key: 'value',
              },
            },
          },
        ],
      },
    ];

    const expected = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Check this image:' },
          {
            type: 'file',
            filename: 'image.png',
            data: base64Data,
            mediaType: 'image/png',
            providerOptions: {
              anthropic: {
                key: 'value',
              },
            },
          },
        ],
      },
    ];

    const result = stringifyForTelemetry(prompt);

    expect(result).toBe(JSON.stringify(expected));
  });

  it('should keep URL images as is', () => {
    const imageUrl = new URL('https://example.com/image.jpg');
    const prompt: LanguageModelV2Prompt = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Check this image:' },
          { type: 'file', data: imageUrl, mediaType: 'image/jpeg' },
        ],
      },
    ];

    const result = stringifyForTelemetry(prompt);

    expect(JSON.parse(result)[0].content[1].data).toBe(imageUrl.toString());
  });

  it('should handle a mixed prompt with various content types', () => {
    const imageData = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0xff]);
    const base64Data = 'data:image/png;base64,iVBOR///';
    const imageUrl = new URL('https://example.com/image.jpg');

    const prompt: LanguageModelV2Prompt = [
      { role: 'system', content: 'You are a helpful assistant.' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Check these images:' },
          { type: 'file', data: imageData, mediaType: 'image/png' },
          { type: 'file', data: imageUrl, mediaType: 'image/jpeg' },
        ],
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'I see the images!' }],
      },
    ];

    const result = stringifyForTelemetry(prompt);
    const parsed = JSON.parse(result);

    expect(parsed[0]).toEqual(prompt[0]);
    expect(parsed[1].content[0]).toEqual(prompt[1].content[0]);
    expect(parsed[1].content[1].data).toBe(base64Data);
    expect(parsed[1].content[2].data).toBe(imageUrl.toString());
    expect(parsed[2]).toEqual(prompt[2]);
  });
});
