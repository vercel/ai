import {
  LanguageModelV1Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';
import {
  GoogleGenerativeAIContentPart,
  GoogleGenerativeAIPrompt,
} from './google-generative-ai-prompt';

export function convertToGoogleGenerativeAIMessages(
  prompt: LanguageModelV1Prompt,
): GoogleGenerativeAIPrompt {
  const messages: GoogleGenerativeAIPrompt = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        // system message becomes user message:
        messages.push({ role: 'user', parts: [{ text: content }] });

        // required for to ensure turn-taking:
        messages.push({ role: 'model', parts: [{ text: '' }] });

        break;
      }

      case 'user': {
        messages.push({
          role: 'user',
          parts: content.map(part => {
            switch (part.type) {
              case 'text': {
                return { text: part.text };
              }
              case 'image': {
                if (part.image instanceof URL) {
                  throw new UnsupportedFunctionalityError({
                    functionality: 'URL image parts',
                  });
                } else {
                  return {
                    inlineData: {
                      mimeType: part.mimeType ?? 'image/jpeg',
                      data: convertUint8ArrayToBase64(part.image),
                    },
                  };
                }
              }
            }
          }),
        });
        break;
      }

      case 'assistant': {
        messages.push({
          role: 'model',
          parts: content
            .map(part => {
              switch (part.type) {
                case 'text': {
                  return part.text.length === 0
                    ? undefined
                    : { text: part.text };
                }
                case 'tool-call': {
                  return {
                    functionCall: {
                      name: part.toolName,
                      args: part.args,
                    },
                  };
                }
              }
            })
            .filter(
              part => part !== undefined,
            ) as GoogleGenerativeAIContentPart[],
        });
        break;
      }

      case 'tool': {
        messages.push({
          role: 'user',
          parts: content.map(part => ({
            functionResponse: {
              name: part.toolName,
              response: part.result,
            },
          })),
        });
        break;
      }
      default: {
        const _exhaustiveCheck: never = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }

  return messages;
}
