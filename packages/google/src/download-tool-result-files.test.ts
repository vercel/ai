import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
import type * as providerUtils from '@ai-sdk/provider-utils';
import { fetchWithValidatedRedirects } from '@ai-sdk/provider-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadToolResultFiles } from './download-tool-result-files';

vi.mock('@ai-sdk/provider-utils', async importOriginal => ({
  ...(await importOriginal<typeof providerUtils>()),
  fetchWithValidatedRedirects: vi.fn(),
}));

const fetchWithValidatedRedirectsMock = vi.mocked(fetchWithValidatedRedirects);

const MAX_BYTES = 1024;

function mockDownloadResponse({
  body = new TextEncoder().encode('%PDF-demo'),
  contentType = 'application/pdf',
  contentLength,
}: {
  body?: Uint8Array;
  contentType?: string;
  contentLength?: number;
} = {}) {
  fetchWithValidatedRedirectsMock.mockResolvedValue(
    new Response(body, {
      status: 200,
      headers: {
        'content-type': contentType,
        ...(contentLength == null
          ? {}
          : { 'content-length': String(contentLength) }),
      },
    }),
  );
}

describe('downloadToolResultFiles', () => {
  beforeEach(() => {
    fetchWithValidatedRedirectsMock.mockReset();
  });

  it.each(['assistant', 'tool'] as const)(
    'downloads URLs in %s tool results with the provided fetch without changing the input',
    async role => {
      const url = 'https://example.com/report.pdf';
      const output = {
        type: 'content' as const,
        value: [
          { type: 'text' as const, text: 'Report' },
          {
            type: 'file-url' as const,
            url,
            mediaType: 'application/pdf',
            providerOptions: { google: { custom: true } },
          },
        ],
      };
      const prompt: LanguageModelV3Prompt = [
        { role: 'user', content: [{ type: 'text', text: 'Read the report' }] },
        {
          role,
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call',
              toolName: 'view',
              output,
            },
          ],
        },
      ];
      const abortSignal = new AbortController().signal;
      const fetch = vi.fn();
      mockDownloadResponse();

      const result = await downloadToolResultFiles(prompt, {
        abortSignal,
        fetch,
        maxBytes: MAX_BYTES,
      });

      expect(fetchWithValidatedRedirectsMock).toHaveBeenCalledExactlyOnceWith({
        url,
        abortSignal,
        fetch,
      });
      expect(result[0]).toBe(prompt[0]);
      expect(result[1].content).toEqual([
        {
          type: 'tool-result',
          toolCallId: 'call',
          toolName: 'view',
          output: {
            type: 'content',
            value: [
              { type: 'text', text: 'Report' },
              {
                type: 'file-data',
                data: 'JVBERi1kZW1v',
                mediaType: 'application/pdf',
                providerOptions: { google: { custom: true } },
              },
            ],
          },
        },
      ]);
      expect(output.value[1]).toMatchObject({ type: 'file-url', url });
    },
  );

  it('preserves supported GCS files and inline data while downloading image URLs', async () => {
    const gcsFile = {
      type: 'file-url' as const,
      url: 'gs://example-bucket/My File.png',
      mediaType: 'image/png',
    };
    const inlineFile = {
      type: 'file-data' as const,
      data: 'JVBERi1kZW1v',
      mediaType: 'application/pdf',
    };
    const imageUrl = 'https://example.com/image.png';
    const fetch = vi.fn();
    mockDownloadResponse({
      body: new TextEncoder().encode('image'),
      contentType: 'image/png',
    });

    const result = await downloadToolResultFiles(
      [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call',
              toolName: 'view',
              output: {
                type: 'content',
                value: [
                  gcsFile,
                  inlineFile,
                  { type: 'image-url', url: imageUrl },
                ],
              },
            },
          ],
        },
      ],
      {
        abortSignal: undefined,
        fetch,
        maxBytes: MAX_BYTES,
        supportedUrls: { 'image/png': [/^gs:\/\/.*$/] },
      },
    );

    expect(fetchWithValidatedRedirectsMock).toHaveBeenCalledExactlyOnceWith({
      url: imageUrl,
      abortSignal: undefined,
      fetch,
    });
    expect(result[0].content).toMatchObject([
      {
        output: {
          value: [
            gcsFile,
            inlineFile,
            { type: 'image-data', data: 'aW1hZ2U=', mediaType: 'image/png' },
          ],
        },
      },
    ]);
  });

  it('uses the default validated transport when no download fetch is configured', async () => {
    const imageUrl = 'https://example.com/image.png';
    mockDownloadResponse({
      body: new TextEncoder().encode('image'),
      contentType: 'image/png',
    });

    await downloadToolResultFiles(
      [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call',
              toolName: 'view',
              output: {
                type: 'content',
                value: [{ type: 'image-url', url: imageUrl }],
              },
            },
          ],
        },
      ],
      { abortSignal: undefined, maxBytes: MAX_BYTES },
    );

    expect(fetchWithValidatedRedirectsMock).toHaveBeenCalledExactlyOnceWith({
      url: imageUrl,
      abortSignal: undefined,
      fetch: undefined,
    });
  });

  it('throws a DownloadError when a tool result file exceeds maxBytes', async () => {
    mockDownloadResponse({
      body: new TextEncoder().encode('too large'),
      contentLength: 9,
    });

    await expect(
      downloadToolResultFiles(
        [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call',
                toolName: 'view',
                output: {
                  type: 'content',
                  value: [
                    { type: 'image-url', url: 'https://example.com/a.png' },
                  ],
                },
              },
            ],
          },
        ],
        { abortSignal: undefined, maxBytes: 8 },
      ),
    ).rejects.toThrow(/exceeded maximum size of 8 bytes/);
  });
});
