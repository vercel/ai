import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { convertFileListToFileUIParts } from './convert-file-list-to-file-ui-parts';

describe('convertFileListToFileUIParts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it('should convert a FileList from another realm', async () => {
    const fileLists = new WeakSet<object>();

    class ParentRealmFileList {
      constructor() {
        fileLists.add(this);
      }

      item() {
        if (!fileLists.has(this)) {
          throw new TypeError('Illegal invocation');
        }

        return null;
      }
    }

    class OtherRealmFileList {
      readonly 0 = {
        name: 'hello.txt',
        type: 'text/plain',
      };
      readonly length = 1;
      readonly [Symbol.toStringTag] = 'FileList';

      constructor() {
        fileLists.add(this);
      }

      item(index: number) {
        if (!fileLists.has(this)) {
          throw new TypeError('Illegal invocation');
        }

        return index === 0 ? this[0] : null;
      }

      [Symbol.iterator]() {
        return [this[0]][Symbol.iterator]();
      }
    }

    class MockFileReader {
      result: string | null = null;
      onload: ((event: { target: MockFileReader }) => void) | null = null;

      readAsDataURL() {
        this.result = 'data:text/plain;base64,aGVsbG8=';
        this.onload?.({ target: this });
      }
    }

    vi.stubGlobal('FileList', ParentRealmFileList);
    vi.stubGlobal('FileReader', MockFileReader);

    await expect(
      convertFileListToFileUIParts(
        new OtherRealmFileList() as unknown as FileList,
      ),
    ).resolves.toEqual([
      {
        type: 'file',
        mediaType: 'text/plain',
        filename: 'hello.txt',
        url: 'data:text/plain;base64,aGVsbG8=',
      },
    ]);
  });
});
