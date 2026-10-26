import type { LanguageModelV4File } from '@ai-sdk/provider';
import { DownloadError } from '@ai-sdk/provider-utils';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { createDownload } from '../util/download/create-download';
import { generateText } from './generate-text';
import { streamText } from './stream-text';

const file: LanguageModelV4File = {
  type: 'file',
  mediaType: 'text/plain',
  data: { type: 'url', url: new URL('https://example.com/generated.txt') },
};
const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
function createModel(outputFile = file) {
  return new MockLanguageModelV4({
    doGenerate: {
      content: [outputFile],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage,
      warnings: [],
    },
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        outputFile,
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage,
        },
      ]),
    }),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('generated file downloads', () => {
  it('emits downloaded HTTPS file content as a usable UI data URL', async () => {
    const fetch = vi.fn(async () => new Response('Hello World'));
    vi.stubGlobal('fetch', fetch);
    const result = streamText({ model: createModel(), prompt: 'image' });
    const chunks = await convertReadableStreamToArray(
      result.toUIMessageStream(),
    );
    expect(chunks.filter(chunk => chunk.type === 'file')).toEqual([
      {
        type: 'file',
        mediaType: 'text/plain',
        url: 'data:text/plain;base64,SGVsbG8gV29ybGQ=',
      },
    ]);
    expect((await result.files)[0].uint8Array).toEqual(
      new TextEncoder().encode('Hello World'),
    );
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each(['generate', 'stream'] as const)(
    'surfaces HTTP download failures during %s',
    async mode => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(null, { status: 503 })),
      );
      if (mode === 'generate') {
        await expect(
          generateText({ model: createModel(), prompt: 'image' }),
        ).rejects.toMatchObject({ name: 'AI_DownloadError', statusCode: 503 });
      } else {
        const result = streamText({
          model: createModel(),
          prompt: 'image',
          onError: () => {},
        });
        await expect(
          convertReadableStreamToArray(result.fullStream),
        ).rejects.toMatchObject({
          name: 'AI_DownloadError',
          statusCode: 503,
        });
      }
    },
  );

  it('rejects an unsafe file URL before fetching it', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(
      generateText({
        model: createModel({
          ...file,
          data: { type: 'url', url: new URL('http://127.0.0.1/file') },
        }),
        prompt: 'image',
      }),
    ).rejects.toBeInstanceOf(DownloadError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['generate', 'stream'] as const)(
    'cancels a %s file download when aborted',
    async mode => {
      const started = Promise.withResolvers<void>();
      const abortController = new AbortController();
      let signal: AbortSignal | null | undefined;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_input, init) => {
          signal = init?.signal;
          started.resolve();
          return new Promise<Response>((_resolve, reject) => {
            if (signal?.aborted) reject(signal.reason);
            else
              signal?.addEventListener('abort', () => reject(signal?.reason), {
                once: true,
              });
          });
        }),
      );
      const options = {
        model: createModel(),
        prompt: 'image',
        abortSignal: abortController.signal,
      };
      const operation =
        mode === 'generate'
          ? generateText(options)
          : convertReadableStreamToArray(
              streamText({ ...options, onError: () => {} }).fullStream,
            );
      // Observe both outcomes immediately to avoid an unhandled rejection.
      const settled = operation.then(
        () => 'fulfilled',
        () => 'rejected',
      );
      await started.promise;
      expect(signal).toBeDefined();
      abortController.abort(new DOMException('cancelled', 'AbortError'));
      expect(signal?.aborted).toBe(true);
      if (mode === 'generate') expect(await settled).toBe('rejected');
      else await settled;
    },
  );

  describe('experimental_download', () => {
    it.each(['generate', 'stream'] as const)(
      'downloads %s file URLs through the configured download function instead of global fetch',
      async mode => {
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        const download = vi.fn(async (requests: Array<{ url: URL }>) =>
          requests.map(() => ({
            data: new TextEncoder().encode('Hello World'),
            mediaType: 'text/plain',
          })),
        );

        const options = {
          model: createModel(),
          prompt: 'image',
          experimental_download: download,
        };
        const files =
          mode === 'generate'
            ? (await generateText(options)).files
            : await streamText(options).files;

        expect(files[0].uint8Array).toEqual(
          new TextEncoder().encode('Hello World'),
        );
        // The prompt has no URLs, so its batch is empty.
        expect(download.mock.calls).toEqual([
          [[]],
          [
            [
              {
                url: new URL('https://example.com/generated.txt'),
                isUrlSupportedByModel: false,
              },
            ],
          ],
        ]);
        expect(fetch).not.toHaveBeenCalled();
      },
    );

    it('uses the fetch transport of createDownload for generated file URLs', async () => {
      const globalFetch = vi.fn();
      vi.stubGlobal('fetch', globalFetch);
      const fetch = vi.fn(async () => new Response('Hello World'));

      const result = await generateText({
        model: createModel(),
        prompt: 'image',
        experimental_download: createDownload({ fetch }),
      });

      expect(result.files[0].uint8Array).toEqual(
        new TextEncoder().encode('Hello World'),
      );
      expect(fetch).toHaveBeenCalledExactlyOnceWith(
        'https://example.com/generated.txt',
        expect.objectContaining({ redirect: 'manual' }),
      );
      expect(globalFetch).not.toHaveBeenCalled();
    });

    it('rejects a null result for a generated file URL', async () => {
      await expect(
        generateText({
          model: createModel(),
          prompt: 'image',
          experimental_download: async requests => requests.map(() => null),
        }),
      ).rejects.toMatchObject({
        name: 'AI_DownloadError',
        url: 'https://example.com/generated.txt',
        message: expect.stringContaining('returned null'),
      });
    });
  });
});
