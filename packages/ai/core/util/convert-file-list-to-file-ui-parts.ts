import { FileUIPart } from '../types';

export async function convertFileListToFileUIParts(
  files: FileList | undefined,
): Promise<Array<FileUIPart>> {
  if (files == null) {
    return [];
  }

  // React-native doesn't have a FileList global:
  if (!globalThis.FileList || !(files instanceof globalThis.FileList)) {
    throw new Error('FileList is not supported in the current environment');
  }

  return Promise.all(
    Array.from(files).map(async attachment => {
      // TODO add filename once supported by file ui parts
      const { name, type } = attachment;

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = readerEvent => {
          resolve(readerEvent.target?.result as string);
        };
        reader.onerror = error => reject(error);
        reader.readAsDataURL(attachment);
      });

      return {
        type: 'file',
        mediaType: type,
        url: dataUrl,
      };
    }),
  );
}
