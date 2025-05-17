/**
 * Helper utility to serialize prompt content for OpenTelemetry tracing.
 * It is initially created because normalized LanguageModelV1Prompt carries
 * images as Uint8Arrays, on which JSON.stringify acts weirdly, converting
 * them to objects with stringified indices as keys, e.g. {"0": 42, "1": 69 }.
 */

import {
  LanguageModelV2DataContent,
  LanguageModelV2FilePart,
  LanguageModelV2Message,
  LanguageModelV2Prompt,
} from '@ai-sdk/provider';
import { convertDataContentToBase64String } from './data-content';

export function stringifyForTelemetry(prompt: LanguageModelV2Prompt): string {
  const processedPrompt = prompt.map((message: LanguageModelV2Message) => {
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
  LanguageModelV2Message['content'],
  string
>[number];

type ProcessedFilePart = LanguageModelV2FilePart & {
  data: Exclude<LanguageModelV2DataContent, Uint8Array>;
};

type ProcessedMessageContentPart =
  | Exclude<MessageContentPart, LanguageModelV2FilePart>
  | ProcessedFilePart;

function processPart(part: MessageContentPart): ProcessedMessageContentPart {
  if (part.type === 'file') {
    return {
      ...part,
      data:
        part.data instanceof Uint8Array
          ? `data:${part.mediaType};base64,${convertDataContentToBase64String(part.data)}`
          : part.data,
    };
  }
  return part;
}
