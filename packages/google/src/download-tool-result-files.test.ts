import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadToolResultFiles } from './download-tool-result-files';

describe('downloadToolResultFiles', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('downloads remote files in tool results without changing user files', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
        headers: { 'content-type': 'image/jpeg' },
      }),
    );
    const prompt: LanguageModelV4Prompt = [
      {
        role: 'user',
        content: [
          {
            type: 'file',
            mediaType: 'image/png',
            data: {
              type: 'url',
              url: new URL('https://example.com/user-image.png'),
            },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'tool-call-id',
            toolName: 'get-image',
            output: {
              type: 'content',
              value: [
                {
                  type: 'file',
                  mediaType: 'image',
                  data: {
                    type: 'url',
                    url: new URL('https://example.com/tool-image.jpg'),
                  },
                },
              ],
            },
          },
        ],
      },
    ];

    const result = await downloadToolResultFiles(prompt, undefined);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://example.com/tool-image.jpg',
      expect.objectContaining({ redirect: 'manual' }),
    );
    expect(result).toMatchObject([
      prompt[0],
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            output: {
              type: 'content',
              value: [
                {
                  type: 'file',
                  mediaType: 'image/jpeg',
                  data: {
                    type: 'data',
                    data: new Uint8Array([0xff, 0xd8, 0xff]),
                  },
                },
              ],
            },
          },
        ],
      },
    ]);
  });
});
