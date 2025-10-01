import {
  LanguageModelV2CallWarning,
  LanguageModelV2Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';

export async function convertToHuggingFaceResponsesMessages({
  prompt,
}: {
  prompt: LanguageModelV2Prompt;
}): Promise<{
  input: string | Array<any>;
  warnings: Array<LanguageModelV2CallWarning>;
}> {
  const messages: Array<any> = [];
  const warnings: Array<LanguageModelV2CallWarning> = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        messages.push({ role: 'system', content });
        break;
      }

      case 'user': {
        messages.push({
          role: 'user',
          content: content.map(part => {
            switch (part.type) {
              case 'text': {
                return { type: 'input_text', text: part.text };
              }
              case 'file': {
                if (part.mediaType.startsWith('image/')) {
                  const mediaType =
                    part.mediaType === 'image/*'
                      ? 'image/jpeg'
                      : part.mediaType;

                  return {
                    type: 'input_image',
                    image_url:
                      part.data instanceof URL
                        ? part.data.toString()
                        : `data:${mediaType};base64,${part.data}`,
                  };
                } else {
                  throw new UnsupportedFunctionalityError({
                    functionality: `file part media type ${part.mediaType}`,
                  });
                }
              }
              default: {
                const _exhaustiveCheck: never = part;
                throw new Error(`Unsupported part type: ${_exhaustiveCheck}`);
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
              // tool calls are handled by the responses API
              break;
            }

            case 'tool-result': {
              // tool results are handled by the responses API
              break;
            }

            case 'reasoning': {
              // include reasoning content in the message text
              messages.push({
                role: 'assistant',
                content: [{ type: 'output_text', text: part.text }],
              });
              break;
            }
          }
        }

        break;
      }

      case 'tool': {
        warnings.push({
          type: 'unsupported-setting',
          setting: 'tool messages',
        });
        break;
      }

      default: {
        const _exhaustiveCheck: never = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }

  return { input: messages, warnings };
}
