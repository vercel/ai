import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadToolResultFiles } from './download-tool-result-files';

function createToolResultPrompt(urls: string[]): LanguageModelV4Prompt {
  return [
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'tool-call-id',
          toolName: 'get-image',
          output: {
            type: 'content',
            value: urls.map(url => ({
              type: 'file' as const,
              mediaType: 'image',
              data: { type: 'url' as const, url: new URL(url) },
            })),
          },
        },
      ],
    },
  ];
}

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

    const result = await downloadToolResultFiles(prompt, {
      abortSignal: undefined,
      maxBytes: 7 * 1024 * 1024,
    });

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

  it('limits the size of each download', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(new Uint8Array([0xff, 0xd8, 0xff])),
    );

    await expect(
      downloadToolResultFiles(
        createToolResultPrompt(['https://example.com/tool-image.jpg']),
        { abortSignal: undefined, maxBytes: 2 },
      ),
    ).rejects.toThrow('exceeded maximum size of 2 bytes');
  });

  it('downloads files sequentially', async () => {
    let activeDownloads = 0;
    let maxActiveDownloads = 0;

    vi.mocked(globalThis.fetch).mockImplementation(async () => {
      activeDownloads++;
      maxActiveDownloads = Math.max(maxActiveDownloads, activeDownloads);
      await new Promise(resolve => setTimeout(resolve, 0));
      activeDownloads--;
      return new Response(new Uint8Array([0xff, 0xd8, 0xff]));
    });

    await downloadToolResultFiles(
      createToolResultPrompt([
        'https://example.com/tool-image-1.jpg',
        'https://example.com/tool-image-2.jpg',
      ]),
      { abortSignal: undefined, maxBytes: 7 * 1024 * 1024 },
    );

    expect(maxActiveDownloads).toBe(1);
  });
});
