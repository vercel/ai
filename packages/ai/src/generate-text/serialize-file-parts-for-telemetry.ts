import { LanguageModelV3Content } from '@ai-sdk/provider';
import { convertDataContentToBase64String } from '../prompt/data-content';
import { ContentPart } from './content-part';
import { ToolSet } from './tool-set';

type TelemetryFilePart = {
  type: 'file';
  mediaType: string;
  data: string;
  providerMetadata?: unknown;
};

export function serializeFilePartsForTelemetry(
  content: Array<LanguageModelV3Content>,
): string | undefined;

export function serializeFilePartsForTelemetry<TOOLS extends ToolSet>(
  content: Array<ContentPart<TOOLS>>,
): string | undefined;

export function serializeFilePartsForTelemetry<TOOLS extends ToolSet>(
  content: Array<LanguageModelV3Content> | Array<ContentPart<TOOLS>>,
): string | undefined {
  const files: Array<TelemetryFilePart> = [];

  for (const part of content) {
    if (part.type !== 'file') {
      continue;
    }

    if ('file' in part) {
      files.push({
        type: 'file',
        mediaType: part.file.mediaType,
        data: part.file.base64,
        ...(part.providerMetadata != null
          ? { providerMetadata: part.providerMetadata }
          : {}),
      });
      continue;
    }

    files.push({
      type: 'file',
      mediaType: part.mediaType,
      data: convertDataContentToBase64String(part.data),
      ...(part.providerMetadata != null
        ? { providerMetadata: part.providerMetadata }
        : {}),
    });
  }

  return files.length > 0 ? JSON.stringify(files) : undefined;
}
