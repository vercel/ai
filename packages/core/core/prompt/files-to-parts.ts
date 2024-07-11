import { MessageFile } from '@ai-sdk/ui-utils';
import { ImagePart, TextPart } from './content-part';

type ContentPart = TextPart | ImagePart;

export function filesToParts(files: MessageFile[]): ContentPart[] {
  const parts: ContentPart[] = [];

  for (const file of files) {
    if (file.dataUrl.includes('data:image')) {
      parts.push({ type: 'image', image: file.dataUrl });
    }
  }

  return parts;
}
