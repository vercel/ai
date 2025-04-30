import { FileUIPart } from '../types';

export async function convertFileListToFileUIParts(
  attachmentsFromOptions: FileList,
): Promise<Array<FileUIPart>> {
  // React-native doesn't have a FileList global:
  if (
    !globalThis.FileList ||
    !(attachmentsFromOptions instanceof globalThis.FileList)
  ) {
    throw new Error('FileList is not supported in the current environment');
  }

  return Promise.all(
    Array.from(attachmentsFromOptions).map(async attachment => {
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
