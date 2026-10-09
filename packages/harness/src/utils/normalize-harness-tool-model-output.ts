import {
  convertInlineFileDataToUint8Array,
  convertUint8ArrayToBase64,
  detectMediaType,
  getTopLevelMediaType,
  isFullMediaType,
  type ToolResultOutput,
} from '@ai-sdk/provider-utils';
import { HarnessCapabilityUnsupportedError } from '../errors/harness-capability-unsupported-error';

export function normalizeHarnessToolModelOutput({
  output,
}: {
  output: ToolResultOutput;
}): ToolResultOutput {
  try {
    const normalized: ToolResultOutput =
      output.type !== 'content'
        ? output
        : {
            ...output,
            value: output.value.map(part => {
              if (part.type === 'text') return part;
              const file =
                part.type === 'image-data' || part.type === 'file-data'
                  ? {
                      ...part,
                      type: 'file' as const,
                      data: { type: 'data' as const, data: part.data },
                    }
                  : part;
              if (
                file.type !== 'file' ||
                file.data.type !== 'data' ||
                getTopLevelMediaType(file.mediaType) !== 'image'
              ) {
                throw new Error(
                  `Unsupported content '${part.type}'${file.type === 'file' ? ` (${file.mediaType}, ${file.data.type})` : ''}.`,
                );
              }
              const data =
                typeof file.data.data === 'string'
                  ? file.data.data
                  : convertUint8ArrayToBase64(
                      convertInlineFileDataToUint8Array(file.data),
                    );
              const mediaType = isFullMediaType(file.mediaType)
                ? file.mediaType
                : detectMediaType({ data, topLevelType: 'image' });
              if (mediaType == null)
                throw new Error('Cannot detect the inline image media type.');
              return {
                ...file,
                mediaType,
                data: { type: 'data' as const, data },
              };
            }),
          };
    return normalized;
  } catch (cause) {
    throw new HarnessCapabilityUnsupportedError({
      message: `Harnesses support only text and inline images in tool model output. ${cause instanceof Error ? cause.message : String(cause)}`,
      cause,
    });
  }
}
