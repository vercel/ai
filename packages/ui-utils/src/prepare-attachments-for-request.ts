import { Attachment } from './types';

export async function prepareAttachmentsForRequest(
  attachmentsFromOptions: FileList | Array<Attachment> | undefined,
) {
  if (!attachmentsFromOptions) {
    return [];
  }

  // https://github.com/vercel/ai/pull/6045
  // React-native doesn't have a FileList
  // global variable, so we need to check for it
  if (
    globalThis.FileList &&
    attachmentsFromOptions instanceof globalThis.FileList
  ) {
    return Promise.all(
      Array.from(attachmentsFromOptions).map(async attachment => {
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
          name,
          contentType: type,
          url: dataUrl,
        };
      }),
    );
  }

  if (Array.isArray(attachmentsFromOptions)) {
    return attachmentsFromOptions;
  }

  throw new Error('Invalid attachments type');
}
