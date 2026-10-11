import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import type { FileUIPart } from './ui-messages';

function isFileList(value: unknown): value is FileList {
  const FileListConstructor = globalThis.FileList;

  if (typeof FileListConstructor === 'undefined') {
    return false;
  }

  if (value instanceof FileListConstructor) {
    return true;
  }

  // FileLists from another realm have a different constructor. Use the
  // platform method's brand check to recognize them without accepting other
  // array-like values.
  if (Object.prototype.toString.call(value) !== '[object FileList]') {
    return false;
  }

  try {
    FileListConstructor.prototype.item.call(value, 0);
    return true;
  } catch {
    return false;
  }
}

export async function convertFileListToFileUIParts(
  files: FileList | undefined,
): Promise<Array<FileUIPart>> {
  if (files == null) {
    return [];
  }

  // React-native doesn't have a FileList global:
  if (!isFileList(files)) {
    throw new UnsupportedFunctionalityError({
      functionality: 'FileList',
      message: 'FileList is not supported in the current environment',
    });
  }

  return Promise.all(
    Array.from(files).map(async file => {
      const { name, type } = file;

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = readerEvent => {
          resolve(readerEvent.target?.result as string);
        };
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
      });

      return {
        type: 'file',
        mediaType: type,
        filename: name,
        url: dataUrl,
      };
    }),
  );
}
