import { DownloadError } from '@ai-sdk/provider-utils';
import { expect, it, vi } from 'vitest';
import { createDownload } from './create-download';

it('forwards the fetch transport, abort signal, and download size limit', async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response('too large', {
      headers: { 'content-type': 'text/plain' },
    }),
  );
  const signal = new AbortController().signal;
  const download = createDownload({ fetch, maxBytes: 3 });
  await expect(
    download({
      url: new URL('https://files.example.com/file'),
      abortSignal: signal,
    }),
  ).rejects.toThrow(DownloadError);
  expect(fetch).toHaveBeenCalledWith(
    'https://files.example.com/file',
    expect.objectContaining({
      signal,
      redirect: 'manual',
    }),
  );
});
