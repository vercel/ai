import { Attachment, getTextFromDataUrl } from '@ai-sdk/ui-utils';
import { ImagePart, TextPart } from './content-part';
import { convertDataContentToUint8Array } from './data-content';

type ContentPart = TextPart | ImagePart;

/**
 * Converts a list of attachments to a list of content parts
 * for consumption by ai/core functions.
 * Currently only supports images and text attachments.
 */
export function attachmentsToParts(attachments: Attachment[]): ContentPart[] {
  const parts: ContentPart[] = [];

  for (const attachment of attachments) {
    try {
      const url = new URL(attachment.url);

      switch (url.protocol) {
        case 'http:':
        case 'https:': {
          if (attachment.contentType?.startsWith('image/')) {
            parts.push({ type: 'image', image: url });
          }
        }

        case 'data:': {
          try {
            const [header, base64Content] = attachment.url.split(',');
            const mimeType = header.split(';')[0].split(':')[1];

            if (mimeType == null || base64Content == null) {
              throw new Error('Invalid data URL format');
            }

            if (attachment.contentType?.startsWith('image/')) {
              parts.push({
                type: 'image',
                image: convertDataContentToUint8Array(base64Content),
              });
            } else if (attachment.contentType?.startsWith('text/')) {
              parts.push({
                type: 'text',
                text: getTextFromDataUrl(attachment.url),
              });
            }
          } catch (error) {
            throw new Error(`Error processing data URL: ${attachment}`);
          }
        }

        default: {
          throw new Error(`Unsupported URL protocol: ${url.protocol}`);
        }
      }
    } catch (_ignored) {
      // not a URL
    }
  }

  return parts;
}
