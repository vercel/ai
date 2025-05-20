import { describe, expect, it } from 'vitest';
import { stringifyForTelemetry } from './stringify-for-telemetry';
import { LanguageModelV1Prompt } from '@ai-sdk/provider';

describe('stringifyForTelemetry', () => {
  it('should stringify a prompt with string content', () => {
    const prompt: LanguageModelV1Prompt = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: [{ type: 'text', text: 'Hello!' }] },
    ];

    const result = stringifyForTelemetry(prompt);

    expect(result).toBe(JSON.stringify(prompt));
  });

  it('should stringify a prompt with text parts', () => {
    const prompt: LanguageModelV1Prompt = [
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
    const imageData = new Uint8Array([1, 2, 3]);
    // https://cryptii.com/pipes/binary-to-base64 with 010203 in hex format input
    const base64Data = 'AQID';
    const prompt: LanguageModelV1Prompt = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Check this image:' },
          { type: 'image', image: imageData },
        ],
      },
    ];

    const expected = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Check this image:' },
          { type: 'image', image: base64Data },
        ],
      },
    ];

    const result = stringifyForTelemetry(prompt);

    expect(result).toBe(JSON.stringify(expected));
  });

  it('should preserve the mime type and provider metadata', () => {
    const imageData = new Uint8Array([1, 2, 3]);
    // https://cryptii.com/pipes/binary-to-base64 with 010203 in hex format input
    const base64Data = 'AQID';
    const prompt: LanguageModelV1Prompt = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Check this image:' },
          {
            type: 'image',
            image: imageData,
            mimeType: 'image/png',
            providerMetadata: {
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
            type: 'image',
            image: base64Data,
            mimeType: 'image/png',
            providerMetadata: {
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
    const prompt: LanguageModelV1Prompt = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Check this image:' },
          { type: 'image', image: imageUrl },
        ],
      },
    ];

    const result = stringifyForTelemetry(prompt);

    // We expect the URL to be preserved as is
    expect(JSON.parse(result)[0].content[1].image).toBe(imageUrl.toString());
  });

  it('should handle a mixed prompt with various content types', () => {
    const imageData = new Uint8Array([1, 2, 3]);
    // https://cryptii.com/pipes/binary-to-base64 with 010203 in hex format input
    const base64Data = 'AQID';
    const imageUrl = new URL('https://example.com/image.jpg');

    const prompt: LanguageModelV1Prompt = [
      { role: 'system', content: 'You are a helpful assistant.' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Check these images:' },
          { type: 'image', image: imageData },
          { type: 'image', image: imageUrl },
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
    expect(parsed[1].content[1].image).toBe(base64Data);
    expect(parsed[1].content[2].image).toBe(imageUrl.toString());
    expect(parsed[2]).toEqual(prompt[2]);
  });
});
