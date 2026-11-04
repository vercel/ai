import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { convertToPerplexityInput } from './convert-to-perplexity-input';

describe('convertToPerplexityInput', () => {
  it('converts system and text messages to Agent API input items', () => {
    expect(
      convertToPerplexityInput([
        { role: 'system', content: 'Be concise.' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Hello ' },
            { type: 'text', text: 'world' },
          ],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello!' }],
        },
      ]).input,
    ).toEqual([
      { type: 'message', role: 'system', content: 'Be concise.' },
      { type: 'message', role: 'user', content: 'Hello world' },
      { type: 'message', role: 'assistant', content: 'Hello!' },
    ]);
  });

  it('converts image URLs and inline image data', () => {
    expect(
      convertToPerplexityInput([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe these images' },
            {
              type: 'file',
              mediaType: 'image/png',
              data: {
                type: 'url',
                url: new URL('https://example.com/image.png'),
              },
            },
            {
              type: 'file',
              mediaType: 'image/png',
              data: { type: 'data', data: new Uint8Array([0, 1, 2, 3]) },
            },
          ],
        },
      ]).input,
    ).toEqual([
      {
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text: 'Describe these images' },
          {
            type: 'input_image',
            image_url: 'https://example.com/image.png',
          },
          {
            type: 'input_image',
            image_url: 'data:image/png;base64,AAECAw==',
          },
        ],
      },
    ]);
  });

  it('converts function calls and tool results for multi-turn input', () => {
    expect(
      convertToPerplexityInput([
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'weather',
              input: { city: 'San Francisco' },
              providerOptions: {
                perplexity: { thoughtSignature: 'signature-1' },
              },
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-1',
              toolName: 'weather',
              output: { type: 'json', value: { temperature: 18 } },
            },
          ],
        },
      ]).input,
    ).toEqual([
      {
        type: 'function_call',
        call_id: 'call-1',
        name: 'weather',
        arguments: '{"city":"San Francisco"}',
        thought_signature: 'signature-1',
      },
      {
        type: 'function_call_output',
        call_id: 'call-1',
        name: 'weather',
        output: '{"temperature":18}',
      },
    ]);
  });

  it('omits null thought signatures from multi-turn input', () => {
    expect(
      convertToPerplexityInput([
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'weather',
              input: { city: 'San Francisco' },
              providerOptions: {
                perplexity: { thoughtSignature: null },
              },
            },
          ],
        },
      ]).input,
    ).toEqual([
      {
        type: 'function_call',
        call_id: 'call-1',
        name: 'weather',
        arguments: '{"city":"San Francisco"}',
      },
    ]);
  });

  it('warns when reasoning prompt parts cannot be replayed', () => {
    const result = convertToPerplexityInput([
      {
        role: 'assistant',
        content: [{ type: 'reasoning', text: 'private reasoning' }],
      },
    ]);

    expect(result.warnings).toEqual([
      { type: 'unsupported', feature: 'reasoning content in prompt' },
    ]);
  });

  it('rejects PDFs because the Agent API only supports image input', () => {
    expect(() =>
      convertToPerplexityInput([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              mediaType: 'application/pdf',
              data: { type: 'data', data: 'JVBERi0xLjQ=' },
            },
          ],
        },
      ]),
    ).toThrow(UnsupportedFunctionalityError);
  });
});
