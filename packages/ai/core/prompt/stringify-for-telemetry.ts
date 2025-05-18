/**
 * Helper utility to serialize prompt content for OpenTelemetry tracing.
 * It is initially created because normalized LanguageModelV1Prompt carries
 * images as Uint8Arrays, on which JSON.stringify acts weirdly, converting
 * them to objects with stringified indices as keys, e.g. {"0": 42, "1": 69 }.
 */

import {
  LanguageModelV1ImagePart,
  LanguageModelV1Message,
  LanguageModelV1Prompt,
  LanguageModelV1ProviderMetadata,
} from '@ai-sdk/provider';
import { convertDataContentToBase64String } from './data-content';

export function stringifyForTelemetry(prompt: LanguageModelV1Prompt): string {
  const processedPrompt = prompt.map((message: LanguageModelV1Message) => {
    return {
      ...message,
      content:
        typeof message.content === 'string'
          ? message.content
          : message.content.map(processPart),
    };
  });

  return JSON.stringify(processedPrompt);
}

type MessageContentPart = Exclude<
  LanguageModelV1Message['content'],
  string
>[number];
type ProcessedMessageContentPart =
  | Exclude<MessageContentPart, LanguageModelV1ImagePart>
  | {
      type: 'image';
      image: string | URL;
      mimeType?: string;
      providerMetadata?: LanguageModelV1ProviderMetadata;
    };

function processPart(part: MessageContentPart): ProcessedMessageContentPart {
  if (part.type === 'image') {
    return {
      ...part,
      image:
        part.image instanceof Uint8Array
          ? convertDataContentToBase64String(part.image)
          : part.image,
    };
  }
  return part;
}
