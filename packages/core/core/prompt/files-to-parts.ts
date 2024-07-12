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
 */
export function filesToParts(files: MessageFile[]): ContentPart[] {
  const parts: ContentPart[] = [];

  for (const file of files) {
    if (isDataURL(file.url)) {
      if (file.url.includes('image/')) {
        parts.push({ type: 'image', image: file.url });
      } else if (file.url.includes('text/')) {
        parts.push({ type: 'text', text: dataUrlToText(file.url) });
      } else {
        throw new Error('Unsupported data URL type');
      }
    } else {
      if (file.mimeType?.includes('image/')) {
        parts.push({ type: 'image', image: file.url });
      }
    }
  }

  return parts;
}
