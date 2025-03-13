import {
  LanguageModelV1CallWarning,
  LanguageModelV1Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';
import { OpenAIResponsesPrompt } from './openai-responses-api-types';

export function convertToOpenAIResponsesMessages({
  prompt,
  systemMessageMode,
}: {
  prompt: LanguageModelV1Prompt;
  systemMessageMode: 'system' | 'developer' | 'remove';
}): {
  messages: OpenAIResponsesPrompt;
  warnings: Array<LanguageModelV1CallWarning>;
} {
  const messages: OpenAIResponsesPrompt = [];
  const warnings: Array<LanguageModelV1CallWarning> = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        switch (systemMessageMode) {
          case 'system': {
            messages.push({ role: 'system', content });
            break;
          }
          case 'developer': {
            messages.push({ role: 'developer', content });
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
        messages.push({
          role: 'user',
          content: content.map((part, index) => {
            switch (part.type) {
              case 'text': {
                return { type: 'input_text', text: part.text };
              }
              case 'image': {
                return {
                  type: 'input_image',
                  image_url:
                    part.image instanceof URL
                      ? part.image.toString()
                      : `data:${
                          part.mimeType ?? 'image/jpeg'
                        };base64,${convertUint8ArrayToBase64(part.image)}`,

                  // OpenAI specific extension: image detail
                  detail: part.providerMetadata?.openai?.imageDetail,
                };
              }
              case 'file': {
                if (part.data instanceof URL) {
                  // The AI SDK automatically downloads files for user file parts with URLs
                  throw new UnsupportedFunctionalityError({
                    functionality: 'File URLs in user messages',
                  });
                }

                switch (part.mimeType) {
                  case 'application/pdf': {
                    return {
                      type: 'input_file',
                      filename: part.filename ?? `part-${index}.pdf`,
                      file_data: `data:application/pdf;base64,${part.data}`,
                    };
                  }
                  default: {
                    throw new UnsupportedFunctionalityError({
                      functionality:
                        'Only PDF files are supported in user messages',
                    });
                  }
                }
              }
            }
          }),
        });

        break;
      }

      case 'assistant': {
        for (const part of content) {
          switch (part.type) {
            case 'text': {
              messages.push({
                role: 'assistant',
                content: [{ type: 'output_text', text: part.text }],
              });
              break;
            }
            case 'tool-call': {
              messages.push({
                type: 'function_call',
                call_id: part.toolCallId,
                name: part.toolName,
                arguments: JSON.stringify(part.args),
              });
              break;
            }
          }
        }

        break;
      }

      case 'tool': {
        for (const part of content) {
          messages.push({
            type: 'function_call_output',
            call_id: part.toolCallId,
            output: JSON.stringify(part.result),
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
