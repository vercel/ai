import { Attachment } from './types';

export async function prepareAttachmentsForRequest(
  attachmentsFromOptions: FileList | Array<Attachment> | undefined,
) {
  if (!attachmentsFromOptions) {
    return [];
  }

  if (attachmentsFromOptions instanceof FileList) {
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
