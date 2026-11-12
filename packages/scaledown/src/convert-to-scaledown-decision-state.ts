import {
  UnsupportedFunctionalityError,
  type Experimental_DecisionModelV4State as DecisionModelV4State,
} from '@ai-sdk/provider';
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';

export function convertToScaleDownDecisionState(state: DecisionModelV4State) {
  const text: string[] = [];
  let document: string | undefined;
  let documentMimeType: string | undefined;

  for (const part of state) {
    if (part.type !== 'file') {
      text.push(part.type === 'text' ? part.text : JSON.stringify(part.value));
      continue;
    }
    if (
      document !== undefined ||
      part.data.type !== 'data' ||
      !['image/jpeg', 'image/png', 'image/tiff', 'application/pdf'].includes(
        part.mediaType,
      )
    ) {
      throw new UnsupportedFunctionalityError({
        functionality:
          'ScaleDown Decisions supports one JPEG, PNG, TIFF, or PDF document.',
      });
    }
    document =
      typeof part.data.data === 'string'
        ? part.data.data
        : convertUint8ArrayToBase64(part.data.data);
    documentMimeType = part.mediaType;
  }

  return {
    ...(text.length > 0 && { text: text.join('\n') }),
    ...(document !== undefined && {
      document,
      document_mime_type: documentMimeType,
    }),
  };
}
