import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
import { downloadToolResultFiles } from './download-tool-result-files';

const MAX_BYTES = 1024;

function createDownloadFetch({
  body = new TextEncoder().encode('%PDF-demo'),
  contentType = 'application/pdf',
  contentLength,
}: {
  body?: Uint8Array;
  contentType?: string;
  contentLength?: number;
} = {}) {
  return vi.fn<FetchFunction>(async () => {
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': contentType,
        ...(contentLength == null
          ? {}
          : { 'content-length': String(contentLength) }),
      },
    });
  });
}

describe('downloadToolResultFiles', () => {
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
      const fetch = createDownloadFetch();

      const result = await downloadToolResultFiles(prompt, {
        abortSignal,
        fetch,
        maxBytes: MAX_BYTES,
      });

      expect(fetch).toHaveBeenCalledTimes(1);
      const [requestedUrl, requestInit] = fetch.mock.calls[0];
      expect(requestedUrl).toBe(url);
      expect(requestInit?.redirect).toBe('manual');
      expect(requestInit?.signal).toBe(abortSignal);
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
    const fetch = createDownloadFetch({
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

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(imageUrl);
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

  it('throws a DownloadError when a tool result file exceeds maxBytes', async () => {
    const fetch = createDownloadFetch({
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
        { abortSignal: undefined, fetch, maxBytes: 8 },
      ),
    ).rejects.toThrow(/exceeded maximum size of 8 bytes/);
  });
});
