// Converts generic chat messages to Adaptive API format
import {
  LanguageModelV2CallWarning,
  LanguageModelV2Prompt,
} from '@ai-sdk/provider';
import { AdaptiveChatCompletionMessage } from './adaptive-types';
import { convertToBase64 } from '@ai-sdk/provider-utils';

export function convertToAdaptiveChatMessages({
  prompt,
  systemMessageMode = 'system',
}: {
  prompt: LanguageModelV2Prompt;
  systemMessageMode?: 'system' | 'remove';
}): {
  messages: AdaptiveChatCompletionMessage[];
  warnings: Array<LanguageModelV2CallWarning>;
} {
  const messages: AdaptiveChatCompletionMessage[] = [];
  const warnings: Array<LanguageModelV2CallWarning> = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        switch (systemMessageMode) {
          case 'system': {
            messages.push({ role: 'system', content });
            break;
          }
          case 'remove': {
            warnings.push({
              type: 'other',
              message: 'system messages are removed for this model',
            });
            break;
          }
          default: {
            const _exhaustiveCheck: never = systemMessageMode;
            throw new Error(
              `Unsupported system message mode: ${_exhaustiveCheck}`,
            );
          }
        }
        break;
      }
      case 'user': {
        if (content.length === 1 && content[0].type === 'text') {
          messages.push({ role: 'user', content: content[0].text });
          break;
        }
        messages.push({
          role: 'user',
          content: content.map((part: any, index) => {
            switch (part.type) {
              case 'text': {
                return { type: 'text', text: part.text };
              }
              case 'file': {
                if (part.mediaType && part.mediaType.startsWith('image/')) {
                  const mediaType =
                    part.mediaType === 'image/*'
                      ? 'image/jpeg'
                      : part.mediaType;
                  return {
                    type: 'image_url',
                    image_url: {
                      url:
                        part.data instanceof URL
                          ? part.data.toString()
                          : `data:${mediaType};base64,${convertToBase64(part.data)}`,
                    },
                  };
                }
                if (
                  part.mediaType &&
                  (part.mediaType === 'audio/wav' ||
                    part.mediaType === 'audio/mp3' ||
                    part.mediaType === 'audio/mpeg')
                ) {
                  if (part.data instanceof URL) {
                    throw new Error(
                      'Audio file parts with URLs are not supported',
                    );
                  }
                  return {
                    type: 'input_audio',
                    input_audio: {
                      data: convertToBase64(part.data),
                      format: part.mediaType === 'audio/wav' ? 'wav' : 'mp3',
                    },
                  };
                }
                if (part.mediaType && part.mediaType === 'application/pdf') {
                  if (part.data instanceof URL) {
                    throw new Error(
                      'PDF file parts with URLs are not supported',
                    );
                  }
                  return {
                    type: 'file',
                    file: {
                      filename: part.filename ?? `part-${index}.pdf`,
                      file_data: `data:application/pdf;base64,${convertToBase64(part.data)}`,
                    },
                  };
                }
                throw new Error(
                  `file part media type ${part.mediaType} is not supported`,
                );
              }
              default: {
                throw new Error(`Unsupported content part type: ${part.type}`);
              }
            }
          }),
        });
        break;
      }
      case 'assistant': {
        const textParts: string[] = [];
        const toolCalls: Array<{
          id: string;
          type: 'function';
          function: { name: string; arguments: string };
        }> = [];
        for (const part of content) {
          switch (part.type) {
            case 'text': {
              textParts.push(part.text);
              break;
            }
            case 'tool-call': {
              toolCalls.push({
                id: part.toolCallId,
                type: 'function',
                function: {
                  name: part.toolName,
                  arguments: JSON.stringify(part.input),
                },
              });
              break;
            }
          }
        }
        const text = textParts.join('');
        messages.push({
          role: 'assistant',
          content: text,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        } as any);
        break;
      }
      case 'tool': {
        for (const toolResponse of content) {
          const output = toolResponse.output;
          const contentValue =
            output.type === 'text' || output.type === 'error-text'
              ? output.value
              : JSON.stringify(output.value);
          messages.push({
            role: 'tool',
            tool_call_id: toolResponse.toolCallId,
            content: contentValue,
          });
        }
        break;
      }
      default: {
        const _exhaustiveCheck: never = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }
  return { messages, warnings };
}
