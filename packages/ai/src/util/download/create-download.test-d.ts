import { describe, expectTypeOf, it } from 'vitest';
import type { transcribe } from '../../transcribe/transcribe';
import { createDownload } from './create-download';
import type { DownloadFunction } from './download-function';

describe('createDownload', () => {
  it('is usable as the download option of transcribe()', () => {
    expectTypeOf(createDownload()).toMatchTypeOf<
      NonNullable<Parameters<typeof transcribe>[0]['download']>
    >();
  });

  it('is usable as experimental_download', () => {
    expectTypeOf(createDownload()).toMatchTypeOf<DownloadFunction>();
  });
});
