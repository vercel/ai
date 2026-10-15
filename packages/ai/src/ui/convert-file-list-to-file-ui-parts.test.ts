import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { convertFileListToFileUIParts } from './convert-file-list-to-file-ui-parts';

describe('convertFileListToFileUIParts', () => {
  it('should throw UnsupportedFunctionalityError when FileList is unavailable', async () => {
    const error = await convertFileListToFileUIParts({} as FileList).catch(
      error => error,
    );

    expect(UnsupportedFunctionalityError.isInstance(error)).toBe(true);
    expect(error).toMatchObject({
      name: 'AI_UnsupportedFunctionalityError',
      functionality: 'FileList',
      message: 'FileList is not supported in the current environment',
    });
  });
});
