import { MessageFile } from '@ai-sdk/ui-utils';
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
 * Converts a list of files to a list of content parts.
 * Currently only supports images and text files.
 */
export function filesToParts(files: MessageFile[]): ContentPart[] {
  const parts: ContentPart[] = [];

  for (const file of files) {
    if (file.mimeType?.includes('image/')) {
      parts.push({ type: 'image', image: file.url });
    }

    if (file.mimeType?.includes('text/') && isDataURL(file.url)) {
      parts.push({ type: 'text', text: dataUrlToText(file.url) });
    }
  }

  return parts;
}
