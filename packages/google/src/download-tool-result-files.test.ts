import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
import type * as providerUtils from '@ai-sdk/provider-utils';
import { downloadBlob } from '@ai-sdk/provider-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadToolResultFiles } from './download-tool-result-files';

vi.mock('@ai-sdk/provider-utils', async importOriginal => ({
  ...(await importOriginal<typeof providerUtils>()),
  downloadBlob: vi.fn(),
}));

describe('downloadToolResultFiles', () => {
  beforeEach(() => {
    vi.mocked(downloadBlob).mockReset();
  });

  it.each(['assistant', 'tool'] as const)(
    'downloads URLs in %s tool results without changing the input',
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
      vi.mocked(downloadBlob).mockResolvedValue(
        new Blob(['%PDF-demo'], { type: 'application/pdf' }),
      );

      const result = await downloadToolResultFiles(prompt, { abortSignal });

      expect(downloadBlob).toHaveBeenCalledExactlyOnceWith(url, {
        abortSignal,
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
    vi.mocked(downloadBlob).mockResolvedValue(
      new Blob(['image'], { type: 'image/png' }),
    );
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
        supportedUrls: { 'image/png': [/^gs:\/\/.*$/] },
      },
    );

    expect(downloadBlob).toHaveBeenCalledExactlyOnceWith(imageUrl, {
      abortSignal: undefined,
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
});
