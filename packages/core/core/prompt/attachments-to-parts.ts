import { Attachment } from '@ai-sdk/ui-utils';
import { ImagePart, TextPart } from './content-part';

type ContentPart = TextPart | ImagePart;

/**
 * Converts a data URL of type text/* to a text string.
 */
export function dataUrlToText(dataUrl: string): string {
  return atob(dataUrl.split(',')[1]);
}

/**
 * Checks if a string is a data URL.
 */
function isDataURL(s: string): boolean {
  return s.startsWith('data:');
}

/**
 * Converts a list of attachments to a list of content parts
 * for consumption by ai/core functions.
 * Currently only supports images and text attachments.
 */
export function attachmentsToParts(attachments: Attachment[]): ContentPart[] {
  const parts: ContentPart[] = [];

  for (const attachment of attachments) {
    if (attachment.mimeType?.includes('image/')) {
      parts.push({ type: 'image', image: attachment.url });
    }

    if (attachment.mimeType?.includes('text/') && isDataURL(attachment.url)) {
      parts.push({ type: 'text', text: dataUrlToText(attachment.url) });
    }
  }

  return parts;
}
