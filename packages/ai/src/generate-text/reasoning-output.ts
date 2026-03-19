import { ReasoningFilePart, ReasoningPart } from '@ai-sdk/provider-utils';
import { ProviderMetadata } from '../types/provider-metadata';
import { DefaultGeneratedFile, GeneratedFile } from './generated-file';

/**
 * Reasoning output of a text generation. It contains a reasoning.
 */
export interface ReasoningOutput {
  type: 'reasoning';

  /**
   * The reasoning text.
   */
  text: string;

  /**
   * Additional provider-specific metadata. They are passed through
   * to the provider from the AI SDK and enable provider-specific
   * functionality that can be fully encapsulated in the provider.
   */
  providerMetadata?: ProviderMetadata;
}

/**
 * Reasoning file output of a text generation.
 * It contains a file generated as part of reasoning.
 */
export interface ReasoningFileOutput {
  type: 'reasoning-file';

  /**
   * The generated file.
   */
  file: GeneratedFile;

  /**
   * Additional provider-specific metadata. They are passed through
   * to the provider from the AI SDK and enable provider-specific
   * functionality that can be fully encapsulated in the provider.
   */
  providerMetadata?: ProviderMetadata;
}

export function convertFromReasoningOutputs(
  parts: Array<ReasoningOutput | ReasoningFileOutput>,
): Array<ReasoningPart | ReasoningFilePart> {
  return parts.map(part => {
    if (part.type === 'reasoning') {
      return {
        type: 'reasoning' as const,
        text: part.text,
        ...(part.providerMetadata != null
          ? { providerOptions: part.providerMetadata }
          : {}),
      };
    }

    return {
      type: 'reasoning-file' as const,
      data: part.file.base64,
      mediaType: part.file.mediaType,
      ...(part.providerMetadata != null
        ? { providerOptions: part.providerMetadata }
        : {}),
    };
  });
}

export function convertToReasoningOutputs(
  parts: Array<ReasoningPart | ReasoningFilePart>,
): Array<ReasoningOutput | ReasoningFileOutput> {
  return parts.map(part => {
    if (part.type === 'reasoning') {
      return {
        type: 'reasoning' as const,
        text: part.text,
        ...(part.providerOptions != null
          ? { providerMetadata: part.providerOptions as ProviderMetadata }
          : {}),
      };
    }

    return {
      type: 'reasoning-file' as const,
      file: new DefaultGeneratedFile({
        data:
          part.data instanceof ArrayBuffer
            ? new Uint8Array(part.data)
            : part.data instanceof URL
              ? part.data.toString()
              : part.data,
        mediaType: part.mediaType,
      }),
      ...(part.providerOptions != null
        ? { providerMetadata: part.providerOptions as ProviderMetadata }
        : {}),
    };
  });
}
