import {
  SharedV3Warning,
  LanguageModelV3Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';

export type HuggingFaceResponsesFunctionCallOutput = {
  type: 'function_call_output';
  call_id: string;
  output: string;
};

export async function convertToHuggingFaceResponsesMessages({
  prompt,
}: {
  prompt: LanguageModelV3Prompt;
}): Promise<{
  input: string | Array<any>;
  warnings: Array<SharedV3Warning>;
}> {
  const messages: Array<any> = [];
  const warnings: Array<SharedV3Warning> = [];

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
        for (const part of content) {
          const output = part.output;

          let contentValue: string;
          switch (output.type) {
            case 'text':
            case 'error-text':
              contentValue = output.value;
              break;
            case 'json':
            case 'error-json':
              contentValue = JSON.stringify(output.value);
              break;
            case 'execution-denied':
              contentValue = output.reason ?? 'Tool execution denied.';
              break;
            case 'content':
              contentValue = JSON.stringify(output.value);
              break;
          }

          const functionCallOutput: HuggingFaceResponsesFunctionCallOutput = {
            type: 'function_call_output',
            call_id: part.toolCallId,
            output: contentValue,
          };

          messages.push(functionCallOutput);
        }
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
