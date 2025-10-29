import {
  LanguageModelV3CallWarning,
  LanguageModelV3Message,
} from '@ai-sdk/provider';
import {
  XaiResponsesInput,
  XaiResponsesInputItem,
} from './xai-responses-api';

export async function convertToXaiResponsesInput(
  prompt: LanguageModelV3Message[],
): Promise<{
  input: XaiResponsesInput;
  inputWarnings: LanguageModelV3CallWarning[];
}> {
  const input: XaiResponsesInput = [];
  const inputWarnings: LanguageModelV3CallWarning[] = [];

  for (const message of prompt) {
    switch (message.role) {
      case 'system': {
        input.push({
          role: 'system',
          content: message.content,
        });
        break;
      }

      case 'user': {
        let userContent = '';

        for (const block of message.content) {
          switch (block.type) {
            case 'text': {
              userContent += block.text;
              break;
            }

            case 'file': {
              inputWarnings.push({
                type: 'other',
                message: 'xAI Responses API does not support files in user messages',
              });
              break;
            }

            default: {
              const _exhaustiveCheck: never = block;
              inputWarnings.push({
                type: 'other',
                message: 'xAI Responses API does not support this content type in user messages',
              });
            }
          }
        }

        input.push({
          role: 'user',
          content: userContent,
        });
        break;
      }

      case 'assistant': {
        let assistantContent = '';

        for (const block of message.content) {
          switch (block.type) {
            case 'text': {
              assistantContent += block.text;
              break;
            }

            case 'tool-call': {
              assistantContent += `[tool_call: ${block.toolName}]`;
              break;
            }

            case 'reasoning':
            case 'tool-result':
            case 'file': {
              inputWarnings.push({
                type: 'other',
                message: 'xAI Responses API does not support this content type in assistant messages',
              });
              break;
            }

            default: {
              const _exhaustiveCheck: never = block;
              inputWarnings.push({
                type: 'other',
                message: 'xAI Responses API does not support this content type in assistant messages',
              });
            }
          }
        }

        input.push({
          role: 'assistant',
          content: assistantContent,
        });
        break;
      }

      case 'tool': {
        inputWarnings.push({
          type: 'other',
          message: 'xAI Responses API does not support tool role messages',
        });
        break;
      }

      default: {
        const _exhaustiveCheck: never = message;
        inputWarnings.push({
          type: 'other',
          message: 'unsupported message role',
        });
      }
    }
  }

  return { input, inputWarnings };
}
