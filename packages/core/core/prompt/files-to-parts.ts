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
 * Converts a list of files to a list of content parts.
 */

export function filesToParts(files: MessageFile[]): ContentPart[] {
  const parts: ContentPart[] = [];

  for (const file of files) {
    if (file.type === 'data-url') {
      if (file.dataUrl.includes('image/')) {
        parts.push({ type: 'image', image: file.dataUrl });
      } else if (file.dataUrl.includes('text/')) {
        parts.push({ type: 'text', text: dataUrlToText(file.dataUrl) });
      }
    } else if (file.type === 'url') {
      if (file.contentType.startsWith('image/')) {
        parts.push({ type: 'image', image: file.url });
      }
    }
  }

  return parts;
}
